import "./vendor/channel-icons.js";

import { qrDataUrl } from "./qr-code.js";
import {
  threadListSignature,
  newTranscriptMessages,
  transcriptRefreshLimit,
  advanceRefreshCursor,
  resolveRefreshTotal,
  shouldSkipPanelRefresh,
  shouldFillTranscriptViewport,
  shouldLoadOlderTranscript,
  prependedTranscriptScrollTop,
} from "./thread-view.js";
import {
  channelBadge,
  channelRows,
  channelFormSpec,
  channelBoundButton,
  isBound,
  isConnected,
  partitionChannels,
  channelSummaryLine,
  bindingAffordance,
  channelSetup,
  channelLastError,
  normalizedLoginView,
  restingLoginView,
  readinessFromChannels,
} from "./channel-view.js";
import {
  tWeb,
  applyTranslations,
  setWebLocale,
  getWebLocale,
  WEB_DEFAULT,
  normalizeWebLocale,
} from "./i18n.js";

const REFRESH_MS = 5000;
const QR_POLL_MS = 2500;

async function getJson(path: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem("comoteApiToken");
  const headers = {
    ...(options.headers ?? {}),
    ...(token ? { "x-comote-token": token } : {}),
  };
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

// Resolves to { ok, value, error } so one failing endpoint never blanks the UI.
async function safeGet(path, fallback) {
  try {
    return { ok: true, value: await getJson(path) };
  } catch (error) {
    return { ok: false, value: fallback, error };
  }
}

// --- Tauri desktop bridge ---------------------------------------------------
// The desktop UI runs in a remote-origin webview where <a target="_blank"> is a
// no-op (the OS just swallows the click), so external links go nowhere. When
// running inside Tauri we route http(s) links through the open_external command,
// which opens them in the system default browser. In a plain browser there is no
// Tauri global, so links keep their normal behavior.
function tauriInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> | null {
  const tauri = window.__TAURI__;
  const invoke = tauri && tauri.core && tauri.core.invoke;
  if (typeof invoke !== "function") {
    return null;
  }
  return invoke(command, args);
}

const canInvokeTauri = typeof window.__TAURI__?.core?.invoke === "function";

// SettingsPage.vue persists capacityRetryEnabled: next.enabled and
// capacityRetryLimit: next.limit through the same /api/settings contract.

// Treat the daemon's own origin as internal so in-app navigation (and the boot
// page) is never hijacked; only genuinely external http(s) links are diverted.
function isExternalHttpLink(anchor) {
  if (!anchor || anchor.target === "_self") {
    return false;
  }
  const href = anchor.getAttribute("href") || "";
  if (!/^https?:\/\//i.test(href)) {
    return false;
  }
  try {
    return new URL(anchor.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

if (canInvokeTauri) {
  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest && event.target.closest("a[href]");
      if (!anchor || !isExternalHttpLink(anchor)) {
        return;
      }
      event.preventDefault();
      try {
        const result = tauriInvoke("open_external", { url: anchor.href });
        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            console.error("open_external failed", error);
            window.location.assign(anchor.href);
          });
        } else {
          window.location.assign(anchor.href);
        }
      } catch (error) {
        console.error("open_external failed", error);
        window.location.assign(anchor.href);
      }
    },
    true,
  );
}

// Generic per-channel login state: id -> { loginId, pollTimer, startCtx }.
const activeLogin = {};
let expandedChannelId = null; // accordion: at most one channel expanded at a time
let lastChannels = []; // latest fetched list, so toggle handlers can re-render
let accordionUserDecided = false; // once the user toggles any channel, stop auto-expanding pending
// Latest channel list from GET /api/channels, kept so event handlers
// (bind/save) can look a channel's meta up by id without re-fetching.
let channelsById = {};
let refreshTimer = null;
let rendering = false;
let renderQueued = false;
const CONVERSATION_THREAD_PAGE_SIZE = 30;
const CONVERSATION_MESSAGE_PAGE_SIZE = 30;
const conversationProjectState = new Map();
let conversationProjects = [];
let conversationSelectedProjectPath = null;
let conversationSelectedThreadId = null;
let conversationLoadedThreadId = null;
let conversationMessageOffset = 0;
let conversationMessageTotal = 0;
let conversationMessageHasMore = false;
let conversationMessageLoading = false;
let conversationMessageGeneration = 0;
// D-5/E-5: "Codex 对话" panel state — the user's project selection (remembered
// in memory across re-renders), the accumulated thread pages, and the opaque
// nextCursor for the "load more" button.
let threadsProjectPath = null; // user's explicit selection; null = follow projects[0]
let threadsLoadedProject = null; // { name, path } of the project the list belongs to
let threadsItems = []; // accumulated thread list (all loaded pages, newest first)
let threadsCursor = null; // nextCursor for the next page; null = no more pages
let threadsPagedBeyondFirst = false; // user clicked "load more" at least once
const THREADS_PAGE_SIZE = 20;

async function render() {
  // Coalesce instead of dropping: a call arriving mid-render queues one more
  // pass so a language switch reliably repaints dynamic tWeb() text at the
  // current locale even if it coincides with an in-flight auto-refresh render.
  if (rendering) {
    renderQueued = true;
    return;
  }
  rendering = true;
  try {
    do {
      // Clear before awaiting; any call during this pass re-sets the flag and
      // earns exactly one more iteration — bounded, no spin, no deadlock.
      renderQueued = false;
      await renderOnce();
    } while (renderQueued);
  } finally {
    rendering = false;
  }
}

window.addEventListener("comote:identities-change", () => {
  void render().catch(() => {});
});

async function renderOnce() {
  const [
    status,
    identities,
    projects,
    channelsResult,
  ] = await Promise.all([
    safeGet("/api/status", null),
    safeGet("/api/identities", []),
    safeGet("/api/projects", []),
    safeGet("/api/channels", []),
  ]);
  // [{...meta, status, runtime, config}] — one registry-driven list drives the
  // cards, the readiness wizard, and the advanced channel dropdown.
  const channels = channelsResult.value ?? [];
  channelsById = Object.fromEntries(channels.map((ch) => [ch.id, ch]));

  // The daemon being unreachable (or token-gated) is the one failure that
  // genuinely blocks everything — surface it explicitly instead of silently.
  if (!status.ok) {
    showLoadError(status.error);
    setBridgeStatus(status.error?.status === 401 ? tWeb("web.status.authRequired") : tWeb("web.status.offline"));
    return;
  }
  hideLoadError();
  setBridgeStatus(status.value.bridge === "running" ? tWeb("web.status.ready") : tWeb("web.status.starting"));

  renderCodexNotice(status.value.connectors.desktop);
  // Hide the retry button when there is nothing to retry.
  document.querySelector("#connectDesktop").hidden = status.value.connectors.desktop.state === "connected";
  const desktopConnector = status.value.connectors.desktop;
  const connectionRows = [
    ["Codex Desktop", humanConnectorState(desktopConnector.state)],
    [tWeb("web.connectors.phoneCommands"), desktopConnector.state === "connected" ? tWeb("web.connectors.available") : tWeb("web.connectors.waitingDesktop")],
    [tWeb("web.connectors.cliFallback"), status.value.connectors.cli.state === "available" ? tWeb("web.connectors.available") : tWeb("web.connectors.unavailable")],
  ];
  if (desktopConnector.command) {
    connectionRows.push([tWeb("web.codexNotice.commandLabel"), escapeHtml(desktopConnector.command)]);
  }
  if (desktopConnector.state !== "connected" && desktopConnector.lastError) {
    connectionRows.push([tWeb("web.codexNotice.title"), escapeHtml(desktopConnector.lastError)]);
  }
  document.querySelector("#connections").innerHTML = connectionRows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join("");

  renderReadiness(status.value, identities, channels);
  renderChannels(channels);
  renderChannelDropdown(channels);
  await renderConversation(status.value, projects.value);
}

function renderReadiness(status, identitiesResult, channels) {
  const section = document.querySelector("#readiness");
  const list = document.querySelector("#readinessList");
  const identities = identitiesResult.ok ? identitiesResult.value : [];
  const desktopState = status?.connectors?.desktop?.state;
  const { bound, running } = readinessFromChannels(channels);

  // Each step carries its dictionary hint (D-2: present in the dict but never
  // rendered before) plus the section anchor an unfinished step links to.
  const items = [
    {
      done: desktopState === "connected" || desktopState === "available",
      label: tWeb("web.readiness.step1.label"),
      hint: tWeb("web.readiness.step1.hint"),
      anchor: "#/connect-phone",
    },
    {
      done: bound,
      label: tWeb("web.readiness.step2.label"),
      hint: tWeb("web.readiness.step2.hint"),
      anchor: "#/connect-phone",
    },
    {
      done: identities.length > 0,
      label: tWeb("web.readiness.step3.label"),
      hint: tWeb("web.readiness.step3.hint"),
      anchor: "#/users",
    },
    {
      done: running,
      label: tWeb("web.readiness.step4.label"),
      hint: tWeb("web.readiness.step4.hint"),
      anchor: "#/connect-phone",
    },
  ];
  // Hide the whole section once setup is complete — no clutter for return users.
  section.hidden = items.every((item) => item.done);

  // SVG icons for each step
  const stepIcons = [
    // Step 1: Desktop connection
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>`,
    // Step 2: Bind channel (phone icon)
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/></svg>`,
    // Step 3: Authorize user (person icon)
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg>`,
    // Step 4: Start listening (arrow icon)
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  ];

  list.innerHTML = items
    .map(
      (item, index) =>
        `<li class="ready-item ${item.done ? "done" : "todo"}">
          <div class="ready-top">
            <div class="ready-mark" aria-hidden="true">${stepIcons[index]}</div>
            <span class="ready-state ${item.done ? "done" : "todo"}">${item.done ? tWeb("web.readiness.state.done") : tWeb("web.readiness.state.todo")}</span>
          </div>
          <div>
            <div class="ready-step-no">${tWeb("web.readiness.stepNo", { step: index + 1 })}</div>
            <strong>${escapeHtml(item.label)}</strong>
            <div class="meta ready-hint">${escapeHtml(item.hint)}${item.done ? "" : ` <a href="${escapeAttr(item.anchor)}">${escapeHtml(tWeb("web.readiness.goto"))}</a>`}</div>
          </div>
        </li>`,
    )
    .join("");
}

function renderProjects(result) {
  const target = document.querySelector("#projects");
  if (!result.ok) {
    target.innerHTML = sectionError(tWeb("web.connectors.error.projects"));
    return;
  }
  const projects = result.value;
  target.innerHTML =
    projects.length === 0
      ? `<li>${tWeb("web.projects.empty")}</li>`
      : projects
          .map(
            (project) =>
              `<li><strong>${escapeHtml(project.id)}. ${escapeHtml(project.name)}</strong><div class="meta">${escapeHtml(project.path)}</div><div class="meta">${escapeHtml(project.source)} · ${escapeHtml(project.status)}</div></li>`,
          )
          .join("");
}

// --- Generic registry-meta-driven channel cards (replaces renderWechat/renderFeishu) ---

function renderChannels(channels) {
  lastChannels = channels;
  const container = document.querySelector("#channelCards");
  if (!container) return;
  const { connected, available } = partitionChannels(channels);
  // Default: if nothing explicitly expanded yet, expand a pending channel (待配对/待扫码) so
  // the pairing code/QR is visible without a click; else keep collapsed.
  if (expandedChannelId === null && !accordionUserDecided) {
    const pending = connected.find((c) => isConnected(c) && !isBound(c));
    if (pending) expandedChannelId = pending.id;
  }
  const sections = [];
  if (connected.length) {
    sections.push(`<section class="channel-section"><div class="channel-section-title">${escapeHtml(tWeb("web.channel.section.connected"))}</div>${connected.map(connectedRowHtml).join("")}</section>`);
  }
  if (available.length) {
    sections.push(`<section class="channel-section"><div class="channel-section-title">${escapeHtml(tWeb("web.channel.section.available"))}</div><div class="channel-add-grid">${available.map(availableTileHtml).join("")}</div></section>`);
  }
  container.innerHTML = sections.join("");
  channels.forEach(paintChannelCardResting); // repaint any in-flight/resting QR area
}

// One delegated click listener for every channel card's bind / save-config
// button. Set up once against the stable #channelCards container so re-renders
// (which replace the cards' innerHTML) never re-bind or double-bind handlers.
function setupChannelCards() {
  const container = document.querySelector("#channelCards");
  if (!container) {
    return;
  }
  container.addEventListener("click", async (event) => {
    const toggleBtn = event.target.closest("[data-toggle]");
    if (toggleBtn) {
      const id = toggleBtn.dataset.toggle;
      accordionUserDecided = true;
      expandedChannelId = expandedChannelId === id ? null : id;
      renderChannels(lastChannels); // re-render from the last fetched list
      return;
    }
    const bindBtn = event.target.closest("[data-bind]");
    if (bindBtn) {
      const ch = channelsById[bindBtn.dataset.bind];
      if (ch) {
        await startQrLogin(ch);
      }
      return;
    }
    const saveBtn = event.target.closest("[data-save-config]");
    if (saveBtn) {
      const id = saveBtn.dataset.saveConfig;
      const channel = channelsById[id];
      const configForm = container.querySelector(`form[data-config-form="${cssEscapeId(id)}"]`);
      if (configForm && !configForm.reportValidity()) {
        return;
      }
      // D-4: give the button a saving → saved lifecycle instead of silence.
      // guardedAction already alerts on failure and returns null there.
      saveBtn.disabled = true;
      const originalLabel = saveBtn.textContent;
      saveBtn.textContent = tWeb("web.channel.saving");
      const result = await guardedAction(async () => {
        const values = readChannelForm(id);
        if (channel?.credentialBinding) {
          values.enabled = true;
        }
        const config: any = await getJson(`/api/channels/${encodeURIComponent(id)}/config`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        });
        // Hybrid channels (currently Feishu) support both QR registration and
        // manually supplied app credentials. A valid manual config is already
        // the binding, so start its WebSocket runtime immediately after save.
        if (channel?.credentialBinding && config?.configured) {
          await getJson(`/api/channels/${encodeURIComponent(id)}/runtime/start`, { method: "POST" });
        }
        return config;
      });
      if (result === null) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalLabel;
        await render();
        return;
      }
      saveBtn.textContent = tWeb("web.channel.saved");
      // Hold the confirmation for 2s, then re-render (which rebuilds the card
      // and restores the normal save label). A 5s auto-refresh may repaint
      // earlier — harmless, it just shortens the confirmation.
      setTimeout(() => {
        render().catch(() => {});
      }, 2000);
    }
  });
}

// Advanced "manual add user" channel dropdown, populated from the registry list
// so a newly registered channel appears here automatically. Preserves the
// current selection across re-renders.
function renderChannelDropdown(channels) {
  const select = document.querySelector("#identityForm select[name='channel']");
  if (!select) {
    return;
  }
  const previous = select.value;
  select.innerHTML = channels
    .map((ch) => `<option value="${escapeAttr(ch.id)}">${escapeHtml(ch.displayName ?? ch.id)}</option>`)
    .join("");
  if (previous && channels.some((ch) => ch.id === previous)) {
    select.value = previous;
  }
}

function channelIconHtml(channelId, fallback = "") {
  const svg = window.ComoteChannelIcons?.[channelId];
  if (svg) {
    return svg;
  }
  return escapeHtml(fallback);
}

// A connected channel: collapsible row. Collapsed = icon+name+summary+badge+管理.
// Expanded = binding affordance (pairing code / QR) + status rows + config form + setup.
function connectedRowHtml(ch) {
  const badge = channelBadge(ch, tWeb);
  const pending = isConnected(ch) && !isBound(ch);
  // The error tone (runtime.lastError) outranks the pending style — a broken
  // channel must look broken even while it is also waiting to be bound.
  const badgeClass = `badge${
    badge.tone === "error"
      ? " error"
      : pending
        ? " pending"
        : badge.tone === "success"
          ? " success"
          : badge.tone === "warning"
            ? " warning"
            : ""
  }`;
  const icon = channelIconHtml(ch.id, (ch.displayName ?? "")[0] ?? "");
  const summary = channelSummaryLine(ch, tWeb);
  const expanded = expandedChannelId === ch.id;
  const toggleLabel = expanded ? tWeb("web.channel.collapse") : tWeb("web.channel.manage");
  const detailId = `channel-detail-${ch.id}`;
  return `
    <article class="channel-row ${expanded ? "expanded" : ""}${ch.credentialBinding ? " channel-card-hybrid" : ""}" data-channel="${escapeAttr(ch.id)}">
      <div class="channel-row-head">
        <div class="channel-tile ${escapeAttr(ch.id)}-icon" aria-hidden="true">${icon}</div>
        <div class="channel-copy"><div class="ch-name">${escapeHtml(ch.displayName ?? ch.id)}</div>${summary ? `<div class="ch-summary" title="${escapeAttr(summary)}">${escapeHtml(summary)}</div>` : ""}</div>
        <span class="${badgeClass}">${escapeHtml(badge.text)}</span>
        <button type="button" class="channel-disclosure" data-toggle="${escapeAttr(ch.id)}" aria-expanded="${expanded}" aria-controls="${escapeAttr(detailId)}" aria-label="${escapeAttr(toggleLabel)}" title="${escapeAttr(toggleLabel)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
      ${expanded ? `<div id="${escapeAttr(detailId)}" class="channel-row-body">${channelDetailHtml(ch)}</div>` : ""}
    </article>`;
}

// An available (unconfigured) channel: compact add tile; expands into the same
// config detail when clicked.
function availableTileHtml(ch) {
  const icon = channelIconHtml(ch.id, (ch.displayName ?? "")[0] ?? "");
  const expanded = expandedChannelId === ch.id;
  const hybridClass = ch.credentialBinding ? " channel-card-hybrid" : "";
  if (expanded) {
    return `<article class="channel-add-tile expanded${hybridClass}" data-channel="${escapeAttr(ch.id)}">
      <div class="channel-row-head channel-add-head">
        <div class="channel-tile ${escapeAttr(ch.id)}-icon" aria-hidden="true">${icon}</div>
        <div class="channel-copy"><div class="ch-name">${escapeHtml(ch.displayName ?? ch.id)}</div><div class="ch-summary">${escapeHtml(tWeb("web.channel.state.notConfigured"))}</div></div>
        <button type="button" class="channel-disclosure" data-toggle="${escapeAttr(ch.id)}" aria-expanded="true" aria-label="${escapeAttr(tWeb("web.channel.collapse"))}" title="${escapeAttr(tWeb("web.channel.collapse"))}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
      ${channelDetailHtml(ch)}</article>`;
  }
  return `<article class="channel-add-tile${hybridClass}" data-channel="${escapeAttr(ch.id)}">
    <div class="channel-tile ${escapeAttr(ch.id)}-icon" aria-hidden="true">${icon}</div>
    <div class="channel-copy"><div class="ch-name">${escapeHtml(ch.displayName ?? ch.id)}</div><div class="ch-summary">${escapeHtml(tWeb("web.channel.state.notConfigured"))}</div></div>
    <button type="button" class="secondary-button channel-add-button" data-toggle="${escapeAttr(ch.id)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      <span>${escapeHtml(tWeb("web.channel.add"))}</span>
    </button>
  </article>`;
}

// Shared expanded detail: binding affordance + status rows + config form + setup +
// actions. Reuses channelConfigFormHtml + the QR area for qr channels.
function channelDetailHtml(ch) {
  const aff = bindingAffordance(ch);
  let affHtml = "";
  if (aff?.kind === "pairingCode") {
    affHtml = `<div class="pairing-block"><div class="intro">${escapeHtml(tWeb("web.channel.pairing.intro"))}</div><span class="pairing-code">${escapeHtml(aff.code ?? "—")}</span></div>`;
  } else if (aff?.kind === "qr") {
    affHtml = qrAreaHtml(ch, ch.credentialBinding ? tWeb("web.channel.feishu.manualHint") : null); // the <id>LoginResult scan area, painted by paintChannelCardResting
  }
  // bound qr channel: still show its resting QR area (account summary) on expand
  const qrResting = ch.binding === "qr" && !aff
    ? qrAreaHtml(ch, ch.credentialBinding ? tWeb("web.channel.feishu.manualHint") : null)
    : "";
  // C-1: surface the runtime's recorded lastError as a red row so a bad token
  // (configure "succeeds", runtime start fails) is no longer invisible.
  const lastError = channelLastError(ch);
  const errorHtml = lastError
    ? `<div class="channel-error"><strong>${escapeHtml(tWeb("web.channel.lastError"))}</strong>: ${escapeHtml(lastError)}</div>`
    : "";
  const rows = channelRows(ch, tWeb).map((r) => `<dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd>`).join("");
  const setup = channelSetup(ch, tWeb);
  const setupHtml = setup ? `<details class="channel-setup"><summary>${escapeHtml(tWeb("web.channel.howTo"))} ▸</summary><ol>${setup.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>${setup.link ? `<a href="${escapeAttr(setup.link.url)}" target="_blank" rel="noopener">↗ ${escapeHtml(setup.link.label)}</a>` : ""}</details>` : "";
  const button = channelBoundButton(ch, tWeb, { activeLoginId: activeLogin[ch.id]?.loginId ?? null });
  if (ch.credentialBinding) {
    const statusHtml = rows ? `<dl class="kv status-rows feishu-status-strip">${rows}</dl>` : "";
    const qrHtml = affHtml || qrResting || qrAreaHtml(ch, tWeb("web.channel.feishu.qrDesc"));
    return `${errorHtml}${statusHtml}<div class="feishu-bind-grid">
      <section class="bind-method bind-method-primary">
        <header class="bind-method-head">
          <span class="bind-method-tag">${escapeHtml(tWeb("web.channel.feishu.recommended"))}</span>
          <h4>${escapeHtml(tWeb("web.channel.feishu.bindCredentials"))}</h4>
          <p>${escapeHtml(tWeb("web.channel.feishu.manualHint"))}</p>
        </header>
        ${channelConfigFormHtml(ch)}
        ${setupHtml}
        <div class="actions card-actions"><button type="button" class="btn-primary-card" data-save-config="${escapeAttr(ch.id)}">${escapeHtml(tWeb("web.channel.feishu.bindCredentials"))}</button></div>
      </section>
      <section class="bind-method bind-method-secondary">
        <header class="bind-method-head">
          <span class="bind-method-tag neutral">${escapeHtml(tWeb("web.channel.feishu.alternative"))}</span>
          <h4>${escapeHtml(tWeb("web.channel.feishu.bindQr"))}</h4>
          <p>${escapeHtml(tWeb("web.channel.feishu.qrDesc"))}</p>
        </header>
        ${qrHtml}
        <div class="actions card-actions"><button type="button" class="secondary-button qr-bind-button" data-bind="${escapeAttr(ch.id)}">${escapeHtml(tWeb("web.channel.feishu.bindQr"))}</button></div>
      </section>
    </div>`;
  }
  const actionBtn = ch.binding === "qr"
    ? `<button type="button" class="btn-primary-card" data-bind="${escapeAttr(ch.id)}">${escapeHtml(button.label)}</button>`
    : `<button type="button" class="btn-primary-card" data-save-config="${escapeAttr(ch.id)}">${escapeHtml(tWeb("web.channel.save"))}</button>`;
  return `${errorHtml}${affHtml}${qrResting}${rows ? `<dl class="kv status-rows">${rows}</dl>` : ""}${channelConfigFormHtml(ch)}${setupHtml}<div class="actions card-actions">${actionBtn}</div>`;
}

// The qr scan area (extracted from the old channelCardHtml qr branch) so both the
// pending-scan affordance and a bound qr channel's resting summary can render it.
function qrAreaHtml(ch, message = null) {
  return `<div id="${escapeAttr(ch.id)}LoginResult" class="qr-result">
    <div class="qr-glyph"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c4c2bc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7M17 21v-4"/></svg></div>
    <span>${escapeHtml(message ?? tWeb("web.channel.qr.scanHint"))}</span>
  </div>`;
}

// Renders the visible configFields as form inputs. Empty when a channel has no
// visible fields (e.g. wechat: only the hidden accountId field).
function channelConfigFormHtml(ch) {
  const spec = channelFormSpec(ch, tWeb);
  if (spec.length === 0) {
    return "";
  }
  const fields = spec
    .map((field) => {
      const inputId = `channel-${ch.id}-${field.name}`;
      const required = field.required ? " required" : "";
      if (field.type === "select") {
        const options = field.options
          .map((opt) => `<option value="${escapeAttr(opt.value)}"${String(opt.value) === String(field.value) ? " selected" : ""}>${escapeHtml(opt.label)}</option>`)
          .join("");
        return `<div class="config-field"><label class="domain-label" for="${escapeAttr(inputId)}">${escapeHtml(field.label)}</label><label class="select-wrap"><select id="${escapeAttr(inputId)}" name="${escapeAttr(field.name)}"${required}>${options}</select></label></div>`;
      }
      if (field.type === "checkbox") {
        return `<label class="config-field"><input name="${escapeAttr(field.name)}" type="checkbox"${field.value ? " checked" : ""}> <span>${escapeHtml(field.label)}</span></label>`;
      }
      const inputType = field.secret || field.type === "password" ? "password" : "text";
      return `<div class="config-field"><label class="domain-label" for="${escapeAttr(inputId)}">${escapeHtml(field.label)}</label><input id="${escapeAttr(inputId)}" name="${escapeAttr(field.name)}" type="${inputType}" value="${escapeAttr(field.value ?? "")}"${required} autocomplete="off"></div>`;
    })
    .join("");
  return `<form class="stack-form channel-config-form" data-config-form="${escapeAttr(ch.id)}">${fields}</form>`;
}

// While no login is in flight, repaint a qr card's QR area to its resting state
// (bound account summary, or the empty scan hint) from current config. Bind/save
// clicks are handled by the delegated listener in setupChannelCards.
function paintChannelCardResting(ch) {
  if (ch.binding !== "qr") {
    return;
  }
  const active = activeLogin[ch.id];
  if (active) {
    // A login is in flight for this card. A full re-render just rebuilt the card's
    // QR element back to the static scan-hint placeholder; immediately repaint the
    // last live login view so the QR doesn't blink out until the next poll tick.
    // (The poller is keyed by id in module state and re-finds the element by id on
    // its next tick, so it keeps working across the innerHTML rebuild.)
    if (active.lastView) {
      renderQrInto(`${ch.id}LoginResult`, active.lastView);
    }
    return;
  }
  renderQrInto(`${ch.id}LoginResult`, restingLoginView(ch, tWeb));
}

// Reads the current values of a channel's visible config inputs. Returns {} when
// the channel has no form (e.g. wechat) — a safe body for /login/start.
function readChannelForm(id): Record<string, string | boolean> {
  const ch = channelsById[id];
  const form = document.querySelector(`#channelCards form[data-config-form="${cssEscapeId(id)}"]`);
  const values: Record<string, string | boolean> = {};
  for (const field of channelFormSpec(ch ?? {}, tWeb)) {
    const el = form?.elements?.[field.name];
    if (!el) {
      continue;
    }
    values[field.name] = field.type === "checkbox" ? el.checked : el.value;
  }
  return values;
}

function cssEscapeId(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

const OPENAI_AVATAR_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>`;
const USER_AVATAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg>`;
const TREE_PROJECT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
const TREE_THREAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const TREE_CHEVRON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;

function conversationThreadKey(thread) {
  return String(thread?.id ?? "");
}

function conversationThreadTitle(thread) {
  return String(thread?.title ?? thread?.name ?? thread?.preview ?? thread?.id ?? "");
}

function conversationProject(path) {
  return conversationProjects.find((project) => project.path === path) ?? null;
}

function syncConversationProjects(projects) {
  conversationProjects = Array.isArray(projects) ? projects : [];
  const livePaths = new Set(conversationProjects.map((project) => project.path));
  for (const path of [...conversationProjectState.keys()]) {
    if (!livePaths.has(path)) conversationProjectState.delete(path);
  }
  for (const project of conversationProjects) {
    const current = conversationProjectState.get(project.path);
    if (current) {
      current.project = project;
    } else {
      conversationProjectState.set(project.path, {
        project,
        expanded: false,
        items: [],
        cursor: null,
        loaded: false,
        loading: false,
        paged: false,
        error: false,
      });
    }
  }
  if (!conversationSelectedProjectPath || !livePaths.has(conversationSelectedProjectPath)) {
    conversationSelectedProjectPath = conversationProjects[0]?.path ?? null;
    conversationSelectedThreadId = null;
    conversationLoadedThreadId = null;
  }
  const selectedState = conversationSelectedProjectPath
    ? conversationProjectState.get(conversationSelectedProjectPath)
    : null;
  if (selectedState) selectedState.expanded = true;
}

function conversationThreadsUrl(cwd, cursor = null) {
  const params = new URLSearchParams({ cwd, limit: String(CONVERSATION_THREAD_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  return `/api/codex/threads?${params}`;
}

function conversationTranscriptUrl(threadId, offset = 0, limit = CONVERSATION_MESSAGE_PAGE_SIZE) {
  const params = new URLSearchParams({
    threadId,
    limit: String(limit),
    offset: String(offset),
  });
  return `/api/codex/transcript?${params}`;
}

function paintConversationTree() {
  const target = document.querySelector("#conversationTree");
  if (!target) return;
  if (conversationProjects.length === 0) {
    target.innerHTML = `<div class="conversation-tree-empty meta">${tWeb("web.conversation.noProjects")}</div>`;
    return;
  }
  target.innerHTML = conversationProjects.map((project) => {
    const state = conversationProjectState.get(project.path);
    const expanded = Boolean(state?.expanded);
    const selectedProject = project.path === conversationSelectedProjectPath;
    let branch = "";
    if (expanded) {
      if (state.loading && !state.loaded) {
        branch = `<div class="conversation-tree-status meta">${tWeb("web.threads.loading")}</div>`;
      } else if (state.error && !state.loaded) {
        branch = `<div class="conversation-tree-status meta">${tWeb("web.threads.loadError")}</div>`;
      } else if (state.loaded && state.items.length === 0) {
        branch = `<div class="conversation-tree-status meta">${tWeb("web.threads.empty", { name: escapeHtml(project.name) })}</div>`;
      } else {
        const threads = (state?.items ?? []).map((thread) => {
          const threadId = conversationThreadKey(thread);
          const selected = selectedProject && threadId === conversationSelectedThreadId;
          return `<button class="conversation-thread-node${selected ? " active" : ""}" type="button" role="treeitem" aria-selected="${selected ? "true" : "false"}" data-project-path="${escapeAttr(project.path)}" data-thread-id="${escapeAttr(threadId)}"><span class="conversation-tree-icon">${TREE_THREAD_ICON}</span><span class="conversation-thread-copy"><strong>${escapeHtml(conversationThreadTitle(thread))}</strong><span>${escapeHtml(threadId)}</span></span></button>`;
        }).join("");
        const more = state?.cursor
          ? `<button class="conversation-tree-more" type="button" data-project-load-more="${escapeAttr(project.path)}"${state.loading ? " disabled" : ""}>${state.loading ? tWeb("web.threads.loading") : tWeb("web.threads.loadMore")}</button>`
          : "";
        branch = threads + more;
      }
    }
    return `<div class="conversation-project-branch${selectedProject ? " selected" : ""}"><button class="conversation-project-node" type="button" role="treeitem" aria-expanded="${expanded ? "true" : "false"}" data-project-path="${escapeAttr(project.path)}"><span class="conversation-tree-chevron">${TREE_CHEVRON_ICON}</span><span class="conversation-tree-icon">${TREE_PROJECT_ICON}</span><span class="conversation-project-copy"><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.path)}</span></span></button><div class="conversation-thread-branch" role="group"${expanded ? "" : " hidden"}>${branch}</div></div>`;
  }).join("");
}

function updateConversationReaderHead(project, thread, source = null) {
  const title = document.querySelector("#conversationReaderTitle");
  const meta = document.querySelector("#conversationReaderMeta");
  if (!title || !meta) return;
  if (!thread) {
    title.textContent = tWeb("web.conversation.selectThread");
    meta.textContent = "";
    return;
  }
  title.textContent = conversationThreadTitle(thread);
  const parts = [project?.name, conversationThreadKey(thread)];
  if (source === "desktop") parts.push(tWeb("web.threads.sourceDesktop"));
  meta.textContent = parts.filter(Boolean).join(" · ");
}

function showConversationReaderMessage(message, meta = "") {
  const empty = document.querySelector("#conversationEmpty");
  const messages = document.querySelector("#conversationMessages");
  const title = document.querySelector("#conversationReaderTitle");
  const metaNode = document.querySelector("#conversationReaderMeta");
  if (empty) {
    const text = empty.querySelector("p");
    if (text) text.textContent = message;
    empty.hidden = false;
  }
  if (messages) messages.hidden = true;
  if (title) title.textContent = message;
  if (metaNode) metaNode.textContent = meta;
}

function renderConversationMessages(messages) {
  return (messages ?? []).map((message) => {
    const isUser = message.role === "user";
    const role = isUser ? tWeb("web.conversation.user") : "Codex";
    const icon = isUser ? USER_AVATAR_ICON : OPENAI_AVATAR_ICON;
    return `<article class="conversation-message conversation-message-${isUser ? "user" : "assistant"}"><span class="conversation-avatar" aria-hidden="true">${icon}</span><div class="conversation-message-copy"><span class="conversation-message-role">${escapeHtml(role)}</span><div class="conversation-bubble">${escapeHtml(message.text)}</div></div></article>`;
  }).join("");
}

function updateConversationHistoryState(message = "") {
  const state = document.querySelector("#conversationHistoryState");
  if (!state) return;
  const text = message || (!conversationMessageHasMore && conversationMessageOffset > 0
    ? tWeb("web.conversation.startReached")
    : "");
  state.textContent = text;
  state.classList.toggle("visible", Boolean(text));
}

function showConversationMessages() {
  const empty = document.querySelector("#conversationEmpty");
  const messages = document.querySelector("#conversationMessages");
  if (empty) empty.hidden = true;
  if (messages) messages.hidden = false;
}

async function openConversationThread(projectPath, thread) {
  const threadId = conversationThreadKey(thread);
  if (!threadId) return;
  conversationSelectedProjectPath = projectPath;
  conversationSelectedThreadId = threadId;
  conversationLoadedThreadId = null;
  conversationMessageOffset = 0;
  conversationMessageTotal = 0;
  conversationMessageHasMore = false;
  conversationMessageLoading = true;
  const generation = ++conversationMessageGeneration;
  const project = conversationProject(projectPath);
  const state = conversationProjectState.get(projectPath);
  if (state) state.expanded = true;
  paintConversationTree();
  updateConversationReaderHead(project, thread);
  showConversationMessages();
  const list = document.querySelector("#conversationMessageList");
  if (list) list.innerHTML = "";
  updateConversationHistoryState(tWeb("web.threads.loading"));

  const result = await safeGet(conversationTranscriptUrl(threadId), null);
  if (generation !== conversationMessageGeneration || conversationSelectedThreadId !== threadId) return;
  conversationMessageLoading = false;
  if (!result.ok || !result.value) {
    updateConversationHistoryState(tWeb("web.conversation.loadError"));
    return;
  }
  const page = (result.value.messages ?? []).slice().reverse();
  conversationMessageOffset = page.length;
  conversationMessageTotal = result.value.total ?? page.length;
  conversationMessageHasMore = Boolean(result.value.hasMore);
  conversationLoadedThreadId = threadId;
  if (list) {
    list.innerHTML = page.length > 0
      ? renderConversationMessages(page)
      : `<div class="conversation-no-messages meta">${tWeb("web.threads.noLocal")}</div>`;
  }
  updateConversationReaderHead(project, thread, result.value.source);
  updateConversationHistoryState();
  const viewport = document.querySelector("#conversationMessages");
  requestAnimationFrame(() => {
    if (viewport && conversationSelectedThreadId === threadId) {
      viewport.scrollTop = viewport.scrollHeight;
      ensureConversationViewportHistory(threadId, generation).catch(() => {});
    }
  });
}

async function refreshConversationMessages() {
  const threadId = conversationSelectedThreadId;
  if (!threadId || conversationLoadedThreadId !== threadId || conversationMessageLoading) return;
  const viewport = document.querySelector("#conversationMessages");
  const list = document.querySelector("#conversationMessageList");
  if (!viewport || !list) return;
  conversationMessageLoading = true;
  const generation = conversationMessageGeneration;
  try {
    const probe = await safeGet(conversationTranscriptUrl(threadId, 0, 20), null);
    if (!probe.ok || !probe.value || generation !== conversationMessageGeneration) return;
    let total = probe.value.total ?? conversationMessageTotal;
    let page = probe.value.messages ?? [];
    const wideLimit = transcriptRefreshLimit(conversationMessageTotal, total);
    if (wideLimit > 20) {
      const wide = await safeGet(conversationTranscriptUrl(threadId, 0, wideLimit), null);
      if (wide.ok && wide.value) {
        total = wide.value.total ?? total;
        page = wide.value.messages ?? page;
      }
    }
    if (generation !== conversationMessageGeneration) return;
    const newest = newTranscriptMessages(page, conversationMessageTotal, total);
    if (newest.length === 0) return;
    const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
    if (!list.querySelector(".conversation-message")) list.innerHTML = "";
    list.insertAdjacentHTML("beforeend", renderConversationMessages(newest));
    const cursor = advanceRefreshCursor(conversationMessageOffset, conversationMessageTotal, newest.length);
    conversationMessageOffset = cursor.offset;
    conversationMessageTotal = resolveRefreshTotal(conversationMessageTotal, total, newest.length);
    if (nearBottom) viewport.scrollTop = viewport.scrollHeight;
  } finally {
    if (generation === conversationMessageGeneration && conversationSelectedThreadId === threadId) {
      conversationMessageLoading = false;
    }
  }
}

async function loadOlderConversationMessages() {
  const viewport = document.querySelector("#conversationMessages");
  const list = document.querySelector("#conversationMessageList");
  const threadId = conversationSelectedThreadId;
  if (!viewport || !list || !threadId
    || !shouldLoadOlderTranscript(viewport.scrollTop, conversationMessageHasMore, conversationMessageLoading)) {
    return false;
  }
  conversationMessageLoading = true;
  updateConversationHistoryState(tWeb("web.conversation.loadingOlder"));
  const generation = conversationMessageGeneration;
  const previousHeight = viewport.scrollHeight;
  const previousTop = viewport.scrollTop;
  const result = await safeGet(
    conversationTranscriptUrl(threadId, conversationMessageOffset, CONVERSATION_MESSAGE_PAGE_SIZE),
    null,
  );
  if (generation !== conversationMessageGeneration || conversationSelectedThreadId !== threadId) return false;
  conversationMessageLoading = false;
  if (!result.ok || !result.value) {
    updateConversationHistoryState(tWeb("web.conversation.loadError"));
    return false;
  }
  const older = (result.value.messages ?? []).slice().reverse();
  if (older.length > 0) {
    if (!list.querySelector(".conversation-message")) list.innerHTML = "";
    list.insertAdjacentHTML("afterbegin", renderConversationMessages(older));
    conversationMessageOffset += older.length;
    requestAnimationFrame(() => {
      if (conversationSelectedThreadId === threadId) {
        viewport.scrollTop = prependedTranscriptScrollTop(previousTop, previousHeight, viewport.scrollHeight);
      }
    });
  }
  conversationMessageHasMore = Boolean(result.value.hasMore) && older.length > 0;
  if (result.value.total != null) conversationMessageTotal = result.value.total;
  updateConversationHistoryState();
  return older.length > 0;
}

async function ensureConversationViewportHistory(threadId, generation) {
  const viewport = document.querySelector("#conversationMessages");
  if (!viewport) return;
  while (
    generation === conversationMessageGeneration
    && conversationSelectedThreadId === threadId
    && shouldFillTranscriptViewport(
      viewport.scrollHeight,
      viewport.clientHeight,
      conversationMessageHasMore,
      conversationMessageLoading,
    )
  ) {
    const loaded = await loadOlderConversationMessages();
    if (!loaded) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

async function loadConversationProjectThreads(projectPath, { cursor = null, autoSelect = false } = {}) {
  const state = conversationProjectState.get(projectPath);
  if (!state || state.loading) return;
  state.loading = true;
  state.error = false;
  paintConversationTree();
  const result = await safeGet(conversationThreadsUrl(projectPath, cursor), null);
  state.loading = false;
  if (!result.ok || !result.value) {
    state.error = true;
    paintConversationTree();
    return;
  }
  const page = result.value?.data ?? result.value?.threads ?? [];
  if (cursor) {
    const known = new Set(state.items.map(conversationThreadKey));
    state.items = [...state.items, ...page.filter((thread) => !known.has(conversationThreadKey(thread)))];
    state.cursor = page.length > 0 ? result.value?.nextCursor ?? null : null;
    state.paged = true;
  } else if (!state.loaded || !state.paged) {
    state.items = page;
    state.cursor = result.value?.nextCursor ?? null;
  } else {
    const headIds = new Set(page.map(conversationThreadKey));
    state.items = [...page, ...state.items.filter((thread) => !headIds.has(conversationThreadKey(thread)))];
  }
  state.loaded = true;
  paintConversationTree();

  if (autoSelect && conversationSelectedProjectPath === projectPath) {
    const selected = state.items.find((thread) => conversationThreadKey(thread) === conversationSelectedThreadId)
      ?? state.items[0]
      ?? null;
    if (!selected) {
      showConversationReaderMessage(tWeb("web.threads.empty", { name: state.project.name }));
      return;
    }
    const selectedId = conversationThreadKey(selected);
    conversationSelectedThreadId = selectedId;
    paintConversationTree();
    if (conversationLoadedThreadId !== selectedId) {
      await openConversationThread(projectPath, selected);
    } else {
      updateConversationReaderHead(state.project, selected);
      await refreshConversationMessages();
    }
  }
}

async function renderConversation(status, projectsValue) {
  syncConversationProjects(projectsValue);
  paintConversationTree();
  if (status?.connectors?.desktop?.state !== "connected") {
    showConversationReaderMessage(
      tWeb("web.threads.disconnected.title"),
      tWeb("web.threads.disconnected.hint"),
    );
    return;
  }
  if (!conversationSelectedProjectPath) {
    showConversationReaderMessage(tWeb("web.conversation.noProjects"));
    return;
  }
  await loadConversationProjectThreads(conversationSelectedProjectPath, { autoSelect: true });
}


// Thread-list paint state. The list is refreshed every 5s; without these
// caches each repaint would `innerHTML =` the whole list and wipe any
// expanded conversation (its loaded transcript + scroll position). We keep
// the set of expanded thread ids, a per-thread cache of the loaded detail
// panel, and a signature of the last painted list so an unchanged list is
// skipped entirely.
const expandedThreadIds = new Set();
const threadDetailCache = new Map(); // threadId -> { html, offset, loaded }
let lastThreadSignature = null;

function defaultThreadDetailState() {
  return { html: "", offset: "0", loaded: "", total: "0" };
}

// Snapshot the currently rendered detail panels back into the cache so the
// next repaint can restore them verbatim (transcript html + pagination state).
function syncExpandedThreadStates(target) {
  for (const row of target.querySelectorAll("li[data-thread-id]")) {
    const threadId = row.dataset.threadId;
    const panel = row.querySelector(".thread-detail");
    if (!threadId || !panel) {
      continue;
    }
    if (panel.hidden) {
      expandedThreadIds.delete(threadId);
      continue;
    }
    expandedThreadIds.add(threadId);
    threadDetailCache.set(threadId, {
      html: panel.innerHTML,
      offset: panel.dataset.offset ?? "0",
      loaded: panel.dataset.loaded ?? "",
      total: panel.dataset.total ?? "0",
    });
  }
}

// Drop cached state for threads that are no longer in the list.
function pruneThreadDetailState(threadList) {
  const visibleIds = new Set(threadList.map((thread) => String(thread.id ?? "")));
  for (const threadId of [...expandedThreadIds]) {
    if (!visibleIds.has(threadId)) {
      expandedThreadIds.delete(threadId);
    }
  }
  for (const threadId of [...threadDetailCache.keys()]) {
    if (!visibleIds.has(threadId)) {
      threadDetailCache.delete(threadId);
    }
  }
}

// Repaints the thread list, restoring any expanded detail panels from cache.
// Skips the repaint entirely when the list (and expansion set) is unchanged,
// so the periodic refresh never clobbers an open conversation.
function paintThreads(threadList, primaryProject) {
  const target = document.querySelector("#threads");

  if (threadList.length === 0) {
    expandedThreadIds.clear();
    threadDetailCache.clear();
    lastThreadSignature = null;
    target.innerHTML = `<li>${tWeb("web.threads.empty", { name: escapeHtml(primaryProject.name) })}</li>`;
    return;
  }

  // Signature folds in each thread's revision (message count / updatedAt /
  // latest preview), not just the id set, so new messages in an existing
  // thread still force a repaint instead of being skipped here.
  const signature = threadListSignature(threadList, expandedThreadIds);
  if (signature === lastThreadSignature) {
    return;
  }

  // Capture live panel state before we blow away the DOM.
  syncExpandedThreadStates(target);
  pruneThreadDetailState(threadList);

  target.innerHTML = threadList
    .map((thread, index) => {
      const threadId = String(thread.id ?? "");
      const title = thread.title ?? thread.name ?? thread.preview ?? threadId;
      const cwd = thread.cwd ?? primaryProject.path;
      const expanded = expandedThreadIds.has(threadId);
      const state = threadDetailCache.get(threadId) ?? defaultThreadDetailState();
      // E-7 accessibility: the row toggles on click, so expose it as a
      // focusable button whose aria-expanded tracks the detail panel.
      return `<li class="thread-row" data-thread-id="${escapeAttr(threadId)}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}"><div class="thread-row-summary"><strong>${index + 1}. ${escapeHtml(title)}</strong><div class="meta">${escapeHtml(threadId)}</div><div class="meta">${escapeHtml(cwd)}</div></div><div class="thread-detail"${expanded ? "" : " hidden"} data-offset="${escapeAttr(state.offset)}" data-loaded="${escapeAttr(state.loaded)}" data-total="${escapeAttr(state.total)}">${expanded ? state.html : ""}</div></li>`;
    })
    .join("");

  lastThreadSignature = signature;
}

// Re-fetch the transcript for every *expanded* detail panel and append any
// messages that arrived since it was loaded. paintThreads restores expanded
// panels from cached HTML, so without this an open conversation would never
// pick up new messages from the 5s poll. Only expanded panels are fetched, so
// the request volume stays one-per-open-conversation. Pagination from "load
// more" is preserved: new (newest) messages are inserted before the load-more
// button and dataset.offset is advanced so older pages still fetch correctly.
async function refreshExpandedThreadDetails(target) {
  for (const row of target.querySelectorAll("li[data-thread-id]")) {
    const threadId = row.dataset.threadId;
    const panel = row.querySelector(".thread-detail");
    if (!threadId || !panel || panel.hidden || panel.dataset.loaded !== "1") {
      continue;
    }
    // Per-panel mutex: skip a panel whose fetch (this refresh or a "load more")
    // is already in flight so a slow/overlapping tick can't read-modify-write the
    // same offset/total/DOM concurrently and duplicate or reorder messages.
    if (shouldSkipPanelRefresh(panel)) {
      continue;
    }
    panel.dataset.refreshing = "1";
    try {
      const prevTotal = Number(panel.dataset.total || 0);
      const total = await refreshPanelTranscript(threadId, panel, prevTotal);
      if (total != null) {
        rememberThreadDetail(row, panel);
      }
    } finally {
      delete panel.dataset.refreshing;
    }
  }
}

// Fetch the newest messages for one expanded panel and append the genuinely-new
// tail. Returns the count the panel is now rendered at (so the caller can cache
// it), or null when the fetch failed. Sizes the page to cover a burst since the
// panel was last rendered — a fixed limit=20 silently dropped the middle of any
// >20-message burst — and advances offset/total by exactly what was appended so
// "load more" and the next refresh's delta stay aligned.
async function refreshPanelTranscript(threadId, panel, prevTotal) {
  // First fetch the default page. Its `total` reveals how big the burst is; if it
  // overflows the default page we re-fetch a page wide enough to carry the whole
  // delta in one newest-first slice (capped), so nothing in the middle is
  // stranded the way a fixed limit=20 used to strand it.
  const probe = await safeGet(
    `/api/codex/transcript?threadId=${encodeURIComponent(threadId)}&limit=20&offset=0`,
    null,
  );
  if (!probe.ok || !probe.value) {
    return null;
  }
  let total = probe.value.total ?? prevTotal;
  let page = probe.value.messages;
  const wideLimit = transcriptRefreshLimit(prevTotal, total);
  if (wideLimit > 20) {
    const wide = await safeGet(
      `/api/codex/transcript?threadId=${encodeURIComponent(threadId)}&limit=${wideLimit}&offset=0`,
      null,
    );
    if (wide.ok && wide.value) {
      total = wide.value.total ?? total;
      page = wide.value.messages;
    }
  }
  const newest = newTranscriptMessages(page, prevTotal, total);
  if (newest.length === 0) {
    // Nothing new; only move total forward by what is actually loaded (0), which
    // leaves it at prevTotal so a later burst is still detected.
    const cursor = advanceRefreshCursor(panel.dataset.offset, prevTotal, 0);
    panel.dataset.total = String(cursor.total);
    return cursor.total;
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = renderThreadMessages(newest);
  const frag = document.createDocumentFragment();
  while (tmp.firstChild) {
    frag.appendChild(tmp.firstChild);
  }
  // The panel may currently show only a placeholder (e.g. "no local history")
  // with no rendered messages; drop it before the first real message lands.
  if (!panel.querySelector(".chat-msg")) {
    panel.innerHTML = "";
  }
  const moreBtn = panel.querySelector(".thread-load-more-btn");
  if (moreBtn) {
    panel.insertBefore(frag, moreBtn);
  } else {
    panel.appendChild(frag);
  }
  // Advance the load-more cursor by exactly what we appended. For total (the next
  // refresh's prevTotal): when the page carried the whole delta, prevTotal+appended
  // already equals the server total; when a burst overflowed even the capped wide
  // page, jump straight to the server total so we don't re-fetch — and re-append —
  // the same newest slice next tick (the un-carried middle is "load more" history).
  const cursor = advanceRefreshCursor(panel.dataset.offset, prevTotal, newest.length);
  const nextTotal = resolveRefreshTotal(prevTotal, total, newest.length);
  panel.dataset.total = String(nextTotal);
  panel.dataset.offset = String(cursor.offset);
  return nextTotal;
}

function threadsUrl(cwd, cursor) {
  const params = new URLSearchParams({ cwd, limit: String(THREADS_PAGE_SIZE) });
  if (cursor) {
    params.set("cursor", cursor);
  }
  return `/api/codex/threads?${params}`;
}

function resetThreadsPanel() {
  expandedThreadIds.clear();
  threadDetailCache.clear();
  lastThreadSignature = null;
  threadsLoadedProject = null;
  threadsItems = [];
  threadsCursor = null;
  threadsPagedBeyondFirst = false;
}

// Keeps the project <select> in sync with /api/projects while preserving the
// user's selection across the 5s re-renders (options are value=path).
function updateThreadsControls(projects, selected) {
  const controls = document.querySelector("#threadsControls");
  const select = document.querySelector("#threadsProjectSelect");
  if (!controls || !select) {
    return;
  }
  controls.hidden = projects.length === 0;
  select.innerHTML = projects
    .map((project) => `<option value="${escapeAttr(project.path)}">${escapeHtml(project.name)}</option>`)
    .join("");
  if (selected) {
    select.value = selected.path;
  }
}

// The "load more" button is only useful while the server reports another page.
function updateThreadsFooter() {
  const footer = document.querySelector("#threadsFooter");
  if (footer) {
    footer.hidden = !(threadsCursor && threadsItems.length > 0);
  }
}

function threadKey(thread) {
  return String(thread?.id ?? "");
}

async function renderThreads(status, projectsValue) {
  const target = document.querySelector("#threads");
  const projects = Array.isArray(projectsValue) ? projectsValue : [];
  // Honor the user's selection when it still exists; otherwise fall back to
  // the first project (also the initial default).
  const selected = projects.find((project) => project.path === threadsProjectPath) ?? projects[0] ?? null;
  updateThreadsControls(projects, selected);
  if (status.connectors.desktop.state !== "connected" || !selected) {
    resetThreadsPanel();
    updateThreadsFooter();
    target.innerHTML = `<li><strong>${tWeb("web.threads.disconnected.title")}</strong><div class="meta">${tWeb("web.threads.disconnected.hint")}</div></li>`;
    return;
  }
  const result = await safeGet(threadsUrl(selected.path, null), null);
  if (!result.ok) {
    lastThreadSignature = null;
    updateThreadsFooter();
    target.innerHTML = sectionError(tWeb("web.connectors.error.threads"));
    return;
  }
  const firstPage = result.value?.data ?? result.value?.threads ?? [];
  const firstCursor = result.value?.nextCursor ?? null;
  if (threadsLoadedProject?.path !== selected.path) {
    // Project switched (or first paint): drop the old project's pages and
    // any expanded-panel state — it belongs to different threads.
    resetThreadsPanel();
    threadsLoadedProject = { name: selected.name, path: selected.path };
    threadsItems = firstPage;
    threadsCursor = firstCursor;
  } else if (!threadsPagedBeyondFirst) {
    // Same project, only the first page loaded: replace it wholesale so
    // removed/archived threads disappear too.
    threadsItems = firstPage;
    threadsCursor = firstCursor;
  } else {
    // Same project with extra pages loaded: refresh the newest page but keep
    // the older pages the user paged into. Dedupe by id, newest page first;
    // the tail cursor is unaffected by new threads appearing at the top.
    const firstIds = new Set(firstPage.map(threadKey));
    threadsItems = [...firstPage, ...threadsItems.filter((thread) => !firstIds.has(threadKey(thread)))];
  }
  updateThreadsFooter();
  paintThreads(threadsItems, selected);
  // paintThreads restores expanded panels from cache; pull fresh transcripts so
  // new messages show up within the 5s poll instead of being frozen at expand.
  await refreshExpandedThreadDetails(target);
}

function setBridgeStatus(label) {
  const pill = document.querySelector("#bridgeStatus");
  pill.textContent = label;
  pill.className = `status-pill status-${
    label === tWeb("web.status.ready")
      ? "ok"
      : label === tWeb("web.status.authRequired")
        ? "warn"
        : label === tWeb("web.status.offline")
          ? "error"
          : "pending"
  }`;
}

function showLoadError(error) {
  const panel = document.querySelector("#loadError");
  const title = document.querySelector("#loadErrorTitle");
  const detail = document.querySelector("#loadErrorDetail");
  const tokenForm = document.querySelector("#apiTokenForm");
  const tokenInput = document.querySelector("#apiTokenInput");
  if (error?.status === 401) {
    title.textContent = tWeb("web.loadError.tokenTitle");
    detail.textContent = tWeb("web.loadError.tokenDetail");
    tokenForm.hidden = false;
    tokenInput.value = localStorage.getItem("comoteApiToken") ?? "";
    requestAnimationFrame(() => tokenInput.focus());
  } else {
    title.textContent = tWeb("web.loadError.connTitle");
    detail.textContent = tWeb("web.loadError.connDetail", { message: error?.message ?? "" });
    tokenForm.hidden = true;
  }
  panel.hidden = false;
}

function hideLoadError() {
  document.querySelector("#loadError").hidden = true;
  document.querySelector("#apiTokenForm").hidden = true;
}

function sectionError(message) {
  return `<li class="list-error"><strong>${escapeHtml(message)}</strong><div class="meta">${tWeb("web.sectionError.retryHint")}</div></li>`;
}


document.querySelector("#retryLoad").addEventListener("click", async () => {
  await render();
});

document.querySelector("#saveApiToken").addEventListener("click", async () => {
  const input = document.querySelector("#apiTokenInput");
  const token = input.value.trim();
  if (!token) {
    input.focus();
    return;
  }
  localStorage.setItem("comoteApiToken", token);
  await render();
});

document.querySelector("#apiTokenInput").addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#saveApiToken").click();
  }
});

document.querySelector("#identityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const data = Object.fromEntries(new FormData(form));
  await guardedAction(() =>
    getJson("/api/identities/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
  form.reset();
  window.dispatchEvent(new CustomEvent("comote:identities-change"));
});

async function connectCodexDesktop({ button = null } = {}) {
  if (button) {
    button.disabled = true;
    button.textContent = tWeb("web.codex.connecting");
  }
  try {
    await getJson("/api/connectors/codex-desktop/auto-connect", { method: "POST" });
  } catch {
    // auto-connect returns 503 when Codex Desktop is closed — the notice banner
    // already tells the user; no need to escalate to a hard error.
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = button.dataset.defaultLabel ?? tWeb("web.codex.retry");
    }
  }
  await render();
}

document.querySelector("#connectDesktop").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = tWeb("web.codex.connecting");
  try {
    await getJson("/api/connectors/codex-desktop/initialize", { method: "POST" });
  } catch (error) {
    window.alert(tWeb("web.codex.connectFailed", { message: error.message }));
  } finally {
    button.disabled = false;
    button.textContent = tWeb("web.codex.retryConnect");
  }
  await render();
});

document.querySelector("#retryCodexConnection").addEventListener("click", async (event) => {
  await connectCodexDesktop({ button: event.currentTarget });
});

document.querySelector("#discoverProjects")?.addEventListener("click", async () => {
  const button = document.querySelector("#discoverProjects");
  button.disabled = true;
  button.textContent = tWeb("web.projects.refreshing");
  try {
    await guardedAction(() => getJson("/api/projects/discover", { method: "POST" }));
    await render();
  } finally {
    button.disabled = false;
    button.textContent = tWeb("web.projects.refresh");
  }
});


// Channel bind/save buttons are handled by ONE delegated listener on the stable
// #channelCards container (setupChannelCards), wired once in init() — no
// per-card or per-channel listeners here.

// Surfaces write failures to the user instead of leaving the UI silently stale.
async function guardedAction(action) {
  try {
    return await action();
  } catch (error) {
    if (error.status === 401) {
      window.alert(tWeb("web.action.unauthorized"));
    } else {
      window.alert(tWeb("web.action.failed", { message: error.message }));
    }
    return null;
  }
}

function renderCodexNotice(desktop) {
  const state = desktop?.state ?? desktop;
  const notice = document.querySelector("#codexNotice");
  notice.hidden = state === "connected" || state === "available";
  if (notice.hidden) {
    return;
  }
  // Show the connector's real failure reason (e.g. "codex executable not
  // found at <path>") instead of only the generic install hint — the reason
  // is what tells the user which of the two fixes applies.
  const errorLine = document.querySelector("#codexNoticeError");
  const lastError = typeof desktop === "object" ? desktop?.lastError : null;
  errorLine.textContent = lastError ?? "";
  errorLine.hidden = !lastError;
  const commandLine = document.querySelector("#codexNoticeCommand");
  const command = typeof desktop === "object" ? desktop?.command : null;
  document.querySelector("#codexNoticeCommandText").textContent = command ?? "";
  commandLine.hidden = !command;
}

// --- Generic QR login: ONE poller for every qr-binding channel (replaces the
// per-channel wechat/feishu start + poll + view code). The backend now starts
// the runtime on confirm and is the single source of truth for the normalized
// {state}, so the frontend fires NO runtime/start and owns no confirm/failure
// vocabulary.

async function startQrLogin(ch) {
  // Rebind-while-polling: kill any running poll timer for this channel BEFORE we
  // overwrite activeLogin[ch.id] with a new object below — otherwise the prior
  // setInterval is orphaned and keeps firing /login/status forever.
  clearInterval(activeLogin[ch.id]?.pollTimer);
  const card = document.querySelector(`#channelCards article[data-channel="${cssEscapeId(ch.id)}"]`);
  const button = card?.querySelector("[data-bind]") ?? null;
  if (button) {
    button.disabled = true;
    button.textContent = tWeb("web.qr.generating");
  }
  // configFields values (feishu: { domain }; wechat: {}). Sent as the login body;
  // the backend takes what it needs and ignores the rest.
  const configValues = readChannelForm(ch.id);
  try {
    const start = await getJson(`/api/channels/${encodeURIComponent(ch.id)}/login/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(configValues),
    });
    const startView = normalizedLoginView(start, tWeb);
    activeLogin[ch.id] = { loginId: start.loginId ?? null, startCtx: start, pollTimer: null, lastView: startView };
    renderQrInto(`${ch.id}LoginResult`, startView);
    pollQrLogin(ch, start);
  } catch (error) {
    delete activeLogin[ch.id];
    renderQrInto(`${ch.id}LoginResult`, { phase: "failed", qrUrl: null, accountLine: null, message: error.message });
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = activeLogin[ch.id]
        ? tWeb("web.channel.refresh")
        : channelBoundButton(channelsById[ch.id] ?? ch, tWeb, { activeLoginId: null }).label;
    }
  }
}

function pollQrLogin(ch, startCtx) {
  clearInterval(activeLogin[ch.id]?.pollTimer);
  // Carry the start response's opaque fields back to /login/status; the backend
  // takes what it needs (feishu reads domain/interval/expireIn; wechat ignores them).
  const params = new URLSearchParams({ loginId: startCtx.loginId ?? "" });
  for (const k of ["domain", "interval", "expireIn"]) {
    if (startCtx[k] != null) {
      params.set(k, startCtx[k]);
    }
  }
  activeLogin[ch.id].pollTimer = setInterval(async () => {
    try {
      const status = await getJson(`/api/channels/${encodeURIComponent(ch.id)}/login/status?${params}`);
      const view = normalizedLoginView(status, tWeb);
      // Keep the QR image visible while waiting — status responses for pending
      // states omit qrUrl, so fall back to the one from /login/start.
      if (!view.qrUrl) {
        view.qrUrl = startCtx.qrUrl ?? null;
      }
      // Remember the live view so a full #channelCards re-render (5s auto-refresh)
      // can immediately repaint this in-flight QR instead of the static placeholder.
      if (activeLogin[ch.id]) {
        activeLogin[ch.id].lastView = view;
      }
      renderQrInto(`${ch.id}LoginResult`, view);
      if (["confirmed", "expired", "failed"].includes(view.phase)) {
        clearInterval(activeLogin[ch.id].pollTimer);
        if (view.phase === "confirmed") {
          // Backend already started the runtime on confirm — just reload.
          delete activeLogin[ch.id];
          await render();
        } else {
          delete activeLogin[ch.id];
        }
      }
    } catch (error) {
      renderQrInto(`${ch.id}LoginResult`, {
        phase: "pending",
        qrUrl: startCtx.qrUrl ?? null,
        accountLine: null,
        message: tWeb("web.channel.qr.checkFailed", { message: error.message }),
      });
    }
  }, QR_POLL_MS);
}

// Renders a normalized login view ({ phase, qrUrl, accountLine, message }) into a
// channel's `.qr-result` element. Reuses normalizeQrImageSource + qrDataUrl.
function renderQrInto(elId, view) {
  const target = document.getElementById(elId);
  if (!target) {
    return;
  }
  target.replaceChildren();
  target.className = "qr-result";

  if (view.phase === "empty") {
    target.append(createQrGlyph());
    target.append(createTextLine(view.message ?? tWeb("web.channel.qr.scanHint")));
    return;
  }
  if (view.phase === "confirmed") {
    target.append(createStrongLine(tWeb("web.channel.qr.confirmed")));
    if (view.accountLine) {
      target.append(createTextLine(view.accountLine));
    }
    if (view.message) {
      target.append(createTextLine(view.message));
    }
    return;
  }
  if (view.phase === "expired" || view.phase === "failed") {
    target.append(createStrongLine(tWeb("web.qr.needRebind")));
    target.append(createTextLine(view.message ?? tWeb(`web.channel.qr.${view.phase}`)));
    return;
  }

  // pending / scanned: show the QR image when available, otherwise the hint glyph.
  const imageSource = normalizeQrImageSource(view.qrUrl);
  if (!imageSource) {
    target.append(createQrGlyph());
    target.append(createTextLine(view.message ?? tWeb("web.channel.qr.scanHint")));
    return;
  }
  target.classList.add("has-qr");
  const image = document.createElement("img");
  image.src = imageSource;
  image.alt = tWeb("web.channel.qr.imageAlt");
  target.append(image);
  const scanHint = tWeb("web.channel.qr.scanHint");
  target.append(createStrongLine(scanHint));
  if (view.message && view.message !== scanHint) {
    target.append(createTextLine(view.message));
  }
}

function createStrongLine(text) {
  const line = document.createElement("strong");
  line.textContent = text;
  return line;
}

function createTextLine(text) {
  const line = document.createElement("span");
  line.textContent = text;
  return line;
}

function createQrGlyph() {
  const wrapper = document.createElement("div");
  wrapper.className = "qr-glyph";
  wrapper.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c4c2bc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7M17 21v-4"/></svg>`;
  return wrapper;
}

function normalizeQrImageSource(value) {
  const text = value?.trim?.();
  if (!text) {
    return null;
  }
  if (/^(data:image\/|https?:\/\/|blob:)/i.test(text)) {
    if (/^https?:\/\//i.test(text) && !/\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(text)) {
      return qrDataUrl(text);
    }
    return text;
  }
  if (text.startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 80) {
    return `data:image/png;base64,${text.replace(/\s/g, "")}`;
  }
  return qrDataUrl(text);
}

// D-3: prefer the registry's displayName (available for every channel, kept in
// channelsById by renderOnce) so dingtalk/telegram identities don't show a bare
// channel id. The wechat/feishu dictionary names remain as a fallback for the
// window before the first /api/channels response lands.
function humanConnectorState(state) {
  if (state === "connected") return tWeb("web.connector.connected");
  if (state === "available") return tWeb("web.connector.available");
  return tWeb("web.connector.disconnected");
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso ?? "";
  }
  return date.toLocaleTimeString(getWebLocale(), { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function renderThreadMessages(messages) {
  return messages
    .map(
      (message) =>
        `<div class="chat-msg chat-${message.role === "user" ? "user" : "assistant"}"><span class="chat-role">${message.role === "user" ? tWeb("web.chat.rolePhone") : "Codex"}</span><span class="chat-text">${escapeHtml(message.text)}</span></div>`,
    )
    .join("");
}

// Persist a panel's current state into the module caches so a subsequent 5s
// repaint restores it. Invalidates the paint signature so the change is not
// skipped on the next render.
function rememberThreadDetail(row, panel) {
  const threadId = row?.dataset?.threadId;
  if (!threadId || !panel) {
    return;
  }
  if (panel.hidden) {
    expandedThreadIds.delete(threadId);
  } else {
    expandedThreadIds.add(threadId);
    threadDetailCache.set(threadId, {
      html: panel.innerHTML,
      offset: panel.dataset.offset ?? "0",
      loaded: panel.dataset.loaded ?? "",
      total: panel.dataset.total ?? "0",
    });
  }
  lastThreadSignature = null;
}

// D-5: switching the project re-fetches the thread list from page one.
document.querySelector("#threadsProjectSelect")?.addEventListener("change", async (event) => {
  threadsProjectPath = event.target.value || null;
  // Invalidate the loaded list so renderThreads treats this as a project switch.
  threadsLoadedProject = null;
  await render();
});

// E-5: append the next (older) page using the server's nextCursor.
document.querySelector("#threadsLoadMore")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!threadsCursor || !threadsLoadedProject || button.disabled) {
    return;
  }
  button.disabled = true;
  const original = button.textContent;
  button.textContent = tWeb("web.threads.loading");
  // Capture which project this request belongs to: if the user switches
  // projects while the request is in flight, the stale response must be
  // dropped, not appended to the new project's list.
  const requestedPath = threadsLoadedProject.path;
  try {
    const result = await safeGet(threadsUrl(requestedPath, threadsCursor), null);
    if (threadsLoadedProject?.path !== requestedPath) {
      return;
    }
    if (result.ok && result.value) {
      const page = result.value?.data ?? result.value?.threads ?? [];
      const known = new Set(threadsItems.map(threadKey));
      threadsItems = [...threadsItems, ...page.filter((thread) => !known.has(threadKey(thread)))];
      // An empty page means the cursor is exhausted regardless of what the
      // server echoes back — otherwise trust its nextCursor.
      threadsCursor = page.length > 0 ? result.value?.nextCursor ?? null : null;
      threadsPagedBeyondFirst = true;
      paintThreads(threadsItems, threadsLoadedProject);
    }
  } finally {
    button.disabled = false;
    button.textContent = original;
    updateThreadsFooter();
  }
});

// E-7: thread rows are rendered as role="button" focusable rows; Enter/Space
// must toggle them exactly like a click. Clicks inside the detail panel are
// excluded, mirroring the click handler below.
document.querySelector("#threads")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const row = event.target.closest("li[data-thread-id]");
  if (!row || event.target.closest(".thread-detail")) {
    return;
  }
  event.preventDefault(); // keep Space from scrolling the page
  row.click();
});

document.querySelector("#threads")?.addEventListener("click", async (event) => {
  const row = event.target.closest("li[data-thread-id]");
  if (!row) {
    return;
  }
  // Don't toggle if clicking a load-more button inside the detail panel
  if (event.target.closest(".thread-detail")) {
    const btn = event.target.closest(".thread-load-more-btn");
    if (!btn) {
      return;
    }
    const panel = btn.closest(".thread-detail");
    // Share the per-panel mutex with the 5s refresh: if a refresh is already
    // appending to this panel, ignore the click so the two don't interleave
    // read-modify-writes on offset/total/DOM.
    if (shouldSkipPanelRefresh(panel)) {
      return;
    }
    const threadId = row.dataset.threadId;
    panel.dataset.refreshing = "1";
    try {
      const currentOffset = Number(panel.dataset.offset || 0);
      const nextResult = await safeGet(
        `/api/codex/transcript?threadId=${encodeURIComponent(threadId)}&limit=20&offset=${currentOffset}`,
        null,
      );
      btn.remove();
      if (!nextResult.ok || !nextResult.value) {
        return;
      }
      const newMessages = (nextResult.value.messages ?? []).slice().reverse();
      const newHasMore = nextResult.value.hasMore ?? false;
      panel.dataset.offset = String(currentOffset + newMessages.length);
      if (nextResult.value.total != null) {
        panel.dataset.total = String(nextResult.value.total);
      }
      const frag = document.createDocumentFragment();
      const tmp = document.createElement("div");
      tmp.innerHTML = renderThreadMessages(newMessages);
      while (tmp.firstChild) {
        frag.appendChild(tmp.firstChild);
      }
      if (newHasMore) {
        const moreLi = document.createElement("div");
        moreLi.innerHTML = `<button class="secondary-button thread-load-more-btn">${tWeb("web.threads.loadMore")}</button>`;
        frag.appendChild(moreLi.firstChild);
      }
      panel.appendChild(frag);
      rememberThreadDetail(row, panel);
    } finally {
      delete panel.dataset.refreshing;
    }
    return;
  }

  const panel = row.querySelector(".thread-detail");
  if (!panel) {
    return;
  }
  const isExpanded = !panel.hidden;
  panel.hidden = isExpanded;
  row.setAttribute("aria-expanded", String(!panel.hidden));
  if (isExpanded) {
    rememberThreadDetail(row, panel);
    return;
  }
  // First expand — check if already loaded
  if (panel.dataset.loaded === "1") {
    rememberThreadDetail(row, panel);
    return;
  }
  panel.dataset.loaded = "1";
  panel.innerHTML = `<div class="meta">${tWeb("web.threads.loading")}</div>`;
  const threadId = row.dataset.threadId;
  const firstResult = await safeGet(
    `/api/codex/transcript?threadId=${encodeURIComponent(threadId)}&limit=5&offset=0`,
    null,
  );
  if (!firstResult.ok || !firstResult.value) {
    panel.innerHTML = `<div class="meta">${tWeb("web.threads.loadError")}</div>`;
    rememberThreadDetail(row, panel);
    return;
  }
  const messages = (firstResult.value.messages ?? []).slice().reverse();
  const hasMore = firstResult.value.hasMore ?? false;
  panel.dataset.offset = String(messages.length);
  // Total message count seen at expand time; the 5s refresh compares against
  // this to detect (and append) only the genuinely new messages.
  panel.dataset.total = String(firstResult.value.total ?? messages.length);
  if (messages.length === 0) {
    panel.innerHTML = `<div class="meta">${tWeb("web.threads.noLocal")}</div>`;
    rememberThreadDetail(row, panel);
    return;
  }
  // E-4: transcripts served from the connector's thread/read fallback (rather
  // than GugleComote's own relay transcript) get a small origin annotation.
  const sourceNote = firstResult.value.source === "desktop"
    ? `<div class="meta thread-source">${tWeb("web.threads.sourceDesktop")}</div>`
    : "";
  let html = sourceNote + renderThreadMessages(messages);
  if (hasMore) {
    html += `<button class="secondary-button thread-load-more-btn">${tWeb("web.threads.loadMore")}</button>`;
  }
  panel.innerHTML = html;
  rememberThreadDetail(row, panel);
});

document.querySelector("#conversationTree")?.addEventListener("click", async (event) => {
  const loadMore = event.target.closest("[data-project-load-more]");
  if (loadMore) {
    const projectPath = loadMore.dataset.projectLoadMore;
    const state = conversationProjectState.get(projectPath);
    if (state?.cursor) await loadConversationProjectThreads(projectPath, { cursor: state.cursor });
    return;
  }
  const threadNode = event.target.closest(".conversation-thread-node");
  if (threadNode) {
    const projectPath = threadNode.dataset.projectPath;
    const threadId = threadNode.dataset.threadId;
    const state = conversationProjectState.get(projectPath);
    const thread = state?.items.find((item) => conversationThreadKey(item) === threadId);
    if (thread) await openConversationThread(projectPath, thread);
    return;
  }
  const projectNode = event.target.closest(".conversation-project-node");
  if (!projectNode) return;
  const projectPath = projectNode.dataset.projectPath;
  const state = conversationProjectState.get(projectPath);
  if (!state) return;
  state.expanded = !state.expanded;
  paintConversationTree();
  if (state.expanded && !state.loaded) {
    await loadConversationProjectThreads(projectPath);
  }
});

document.querySelector("#conversationMessages")?.addEventListener("scroll", () => {
  loadOlderConversationMessages().catch(() => {});
}, { passive: true });

function startAutoRefresh() {
  if (refreshTimer) {
    return;
  }
  refreshTimer = setInterval(() => {
    if (document.hidden) {
      return;
    }
    render().catch(() => {});
  }, REFRESH_MS);
}

// Map the OS/browser language to a discovered UI locale. Unmatched -> English.
function mapSystemLocale(navLang) {
  return normalizeWebLocale(navLang, normalizeWebLocale("en"));
}

// The daemon keeps primary language codes for IM-side translations while the
// browser uses the full BCP 47 ids discovered from JSON file names.
function settingsLocale(locale) {
  return normalizeWebLocale(locale).split("-")[0].toLowerCase();
}

window.addEventListener("comote:locale-change", (event) => {
  const requested = (event as CustomEvent<{ locale?: string }>).detail?.locale;
  const locale = normalizeWebLocale(requested);
  void getJson("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale: settingsLocale(locale) }),
  }).catch(() => {});
  setWebLocale(locale);
  applyTranslations(document);
  void refreshVersionStatus().catch(() => {});
  void render().catch(() => {});
});

async function init() {
  setupChannelCards();
  setBridgeStatus(tWeb("web.status.starting"));
  const settings = await safeGet("/api/settings", {
    locale: "zh",
    supported: ["zh"],
    localeExplicit: true,
    preferredConnector: "desktop",
    capacityRetryEnabled: false,
    capacityRetryLimit: 10,
  });
  let locale = normalizeWebLocale(settings.value?.locale ?? WEB_DEFAULT);
  // First launch (no committed locale): follow the OS language, English if unmatched,
  // and persist the choice so subsequent launches respect it (and a manual switch).
  if (!settings.value?.localeExplicit) {
    const sys = mapSystemLocale(navigator.language || navigator.languages?.[0]);
    if (settingsLocale(sys) !== settingsLocale(locale)) {
      locale = sys;
      try {
        await getJson("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: settingsLocale(locale) }),
        });
      } catch {
        // still apply locally even if persisting failed
      }
    }
  }
  setWebLocale(locale);
  applyTranslations(document);
  const versionData = await refreshVersionStatus();
  if (includePrereleasesPreference() && !versionData?.includePrereleases) {
    await checkVersionNow(true).catch(() => {});
  }
  await render(); // paint immediately with whatever the daemon returns
  startAutoRefresh();
  // Re-check version every 15 minutes so the banner appears without a daemon
  // restart once a release lands.
  setInterval(() => {
    refreshVersionStatus().catch(() => {});
  }, 15 * 60 * 1000);
  // Codex Desktop connection runs in the background so it never blocks paint.
  connectCodexDesktop().catch(() => {});
}

function includePrereleasesPreference() {
  return localStorage.getItem("comoteIncludePrereleases") === "true";
}

async function refreshVersionStatus() {
  const versionEl = document.querySelector("#sidebarVersion");
  const banner = document.querySelector("#updateNotice");
  const versionResult = await safeGet("/api/version", null);
  const data = versionResult.ok ? versionResult.value : null;
  const current = data?.version ?? null;
  if (versionEl) {
    if (current && data?.hasUpdate && data.latest) {
      versionEl.textContent = tWeb("web.version.withUpdate", { current, latest: data.latest });
    } else if (current) {
      versionEl.textContent = tWeb("web.version.latest", { current });
    } else {
      versionEl.textContent = tWeb("web.version.noCurrent");
    }
  }
  if (banner) {
    if (data?.hasUpdate && data.latest) {
      banner.hidden = false;
      const latestEl = document.querySelector("#updateLatestVersion");
      const currentEl = document.querySelector("#updateCurrentVersion");
      const linkEl = document.querySelector("#updateDownloadLink");
      const suffixEl = document.querySelector("#updateCurrentSuffix");
      const commandLine = document.querySelector("#updateCommandLine");
      const commandText = document.querySelector("#updateCommandText");
      if (latestEl) latestEl.textContent = data.latest;
      if (currentEl) currentEl.textContent = current ?? tWeb("web.version.unknown");
      // Linux installs come from npm: render a copy-pasteable command instead of
      // a download link (CI ships no Linux asset). mac/win keep the link.
      if (data.updateCommand) {
        if (linkEl) linkEl.hidden = true;
        if (suffixEl) suffixEl.textContent = tWeb("web.update.currentSuffixNpm");
        if (commandText) commandText.textContent = data.updateCommand;
        if (commandLine) commandLine.hidden = false;
      } else {
        if (commandLine) commandLine.hidden = true;
        if (linkEl) {
          linkEl.hidden = false;
          linkEl.href = data.downloadUrl ?? data.releaseUrl ?? "https://github.com/Gu-ZT/Comote/releases";
        }
        if (suffixEl) suffixEl.textContent = tWeb("web.update.currentSuffix");
      }
    } else {
      banner.hidden = true;
    }
  }
  return data;
}

async function checkVersionNow(includePrereleases) {
  localStorage.setItem("comoteIncludePrereleases", String(includePrereleases));
  await getJson(`/api/version/check?includePrereleases=${includePrereleases ? "true" : "false"}`, { method: "POST" });
  await refreshVersionStatus();
}

document.querySelector("#refreshConnect")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = tWeb("web.button.refreshing");
  try {
    await render();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

window.addEventListener("comote:version-change", () => {
  void refreshVersionStatus().catch(() => {});
});

init().catch((error) => {
  setBridgeStatus(tWeb("web.status.error"));
  showLoadError(error);
  console.error(error);
});
