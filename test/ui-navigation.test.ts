import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop navigation switches between exclusive application views", async () => {
  const [html, boot, js, css] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/boot.html", "utf8"),
    readFile("dist/public/app.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);

  const navTargets = [...html.matchAll(/class="nav-item[^"]*" href="#([^"]+)"/g)].map((match) => match[1]);
  assert.ok(navTargets.length >= 6);
  for (const target of navTargets) {
    assert.match(html, new RegExp(`<section id="${target}" class="[^"]*app-page`));
  }

  assert.equal((html.match(/class="[^"]*app-page active[^"]*"/g) ?? []).length, 1);
  assert.match(html, /<img class="brand-logo" src="\/icon\.png"/);
  assert.match(boot, /<img class="logo" src="\.\/icon\.png"/);
  assert.match(js, /window\.addEventListener\("hashchange"/);
  assert.doesNotMatch(js, /IntersectionObserver/);
  assert.match(css, /\.app-page\.active\s*\{\s*display:\s*block/);
  assert.doesNotMatch(css, /--ui-zoom|zoom:\s*var\(--ui-zoom\)/);
});

test("conversation history uses a project tree and split message reader", async () => {
  const [html, js, css] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("dist/public/app.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);

  assert.match(html, /id="conversationTree" class="conversation-tree" role="tree"/);
  assert.match(html, /id="conversationMessages" class="conversation-messages"/);
  assert.match(html, /id="conversationMessageList" class="conversation-message-list"/);
  assert.doesNotMatch(html, /id="conversationList"/);
  assert.match(js, /const OPENAI_AVATAR_ICON = `<svg/);
  assert.match(js, /const USER_AVATAR_ICON = `<svg/);
  assert.match(js, /async function loadOlderConversationMessages/);
  assert.match(js, /prependedTranscriptScrollTop/);
  assert.match(css, /\.conversation-browser\s*\{[^}]*grid-template-columns:\s*300px minmax\(0, 1fr\)/s);
  assert.match(css, /\.conversation-message-user\s*\{[^}]*flex-direction:\s*row-reverse/s);
  assert.match(css, /\.conversation-messages\s*\{[^}]*overflow-y:\s*auto/s);
});

test("identity rows and channel summaries constrain long dynamic text", async () => {
  const [js, css] = await Promise.all([
    readFile("dist/public/app.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);

  assert.match(js, /class="identity-id" title=/);
  assert.match(css, /\.list-row-copy\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.identity-meta \.identity-id\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.channel-row-head \.ch-summary[\s\S]*text-overflow:\s*ellipsis/);
});

test("desktop approvals expose the allow-for-session decision", async () => {
  const [js, i18n, css] = await Promise.all([
    readFile("dist/public/app.js", "utf8"),
    readFile("dist/public/i18n.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);
  assert.match(js, /\|acceptForSession/);
  assert.match(i18n, /web\.approvals\.acceptForSession/);
  assert.match(js, /class="list-row approval-row"/);
  assert.match(css, /\.approval-copy\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.approval-actions\s*\{[^}]*flex:\s*1 1 360px[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.approval-actions\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("phone commands render as a complete copyable list with tooltips", async () => {
  const [html, js, css] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("dist/public/app.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);
  assert.match(html, /id="phoneCommandList" class="command-list"/);
  assert.doesNotMatch(html, /command-chip/);
  assert.match(js, /const PHONE_COMMANDS = \[/);
  for (const command of ["help", "status", "current", "projects", "open", "sessions", "use", "switch", "tail", "new", "file", "automode", "model", "cancel", "approve", "deny"]) {
    assert.match(js, new RegExp(`id: "${command}"`));
    assert.match(js, new RegExp(`web\\.commands\\.tooltip\\.\\$\\{command\\.id\\}`));
  }
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /document\.execCommand\("copy"\)/);
  assert.match(css, /\.command-row:hover[^\{]*\.command-tooltip/);
  assert.match(css, /\.command-row:focus-visible[^\{]*\.command-tooltip/);
  assert.match(css, /\.command-row\s*\{[^}]*grid-template-columns:\s*minmax\(190px, 1fr\) minmax\(0, 2fr\)/s);
  assert.match(css, /\.command-description\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.command-description\s*\{\s*display:\s*none/s);
  assert.match(css, /white-space:\s*pre-line/);
  assert.match(css, /max-width:\s*min\(320px, calc\(100vw - 40px\)\)/);
});

test("advanced settings expose a persistent Codex connector selector", async () => {
  const [html, js, css] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("dist/public/app.js", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);

  assert.match(html, /id="preferredConnector" class="segmented-selector"/);
  assert.match(html, /name="preferredConnector" value="desktop"/);
  assert.match(html, /name="preferredConnector" value="cli"/);
  assert.match(js, /JSON\.stringify\(\{ preferredConnector: radio\.value \}\)/);
  assert.match(html, /id="capacityRetryEnabled" type="checkbox" role="switch"/);
  assert.match(html, /id="capacityRetryLimit" type="number" min="1" max="100"/);
  assert.match(js, /capacityRetryEnabled: next\.enabled/);
  assert.match(js, /capacityRetryLimit: next\.limit/);
  assert.match(css, /\.segmented-selector\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(css, /\.capacity-retry-limit-field\s*\{/);
  assert.match(css, /\.advanced-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 760px\)[^}]*justify-content:\s*center/s);
});

test("Tauri external links use the real bridge and keep a browser fallback", async () => {
  const [js, config] = await Promise.all([
    readFile("dist/public/app.js", "utf8"),
    readFile("src-tauri/tauri.conf.json", "utf8"),
  ]);
  assert.match(js, /const canInvokeTauri = typeof window\.__TAURI__\?\.core\?\.invoke === "function"/);
  assert.match(js, /if \(canInvokeTauri\)/);
  assert.match(config, /"withGlobalTauri"\s*:\s*true/);
});

test("channel cards use local brand SVG icons", async () => {
  const [js, icons] = await Promise.all([
    readFile("dist/public/app.js", "utf8"),
    readFile("public/vendor/channel-icons.js", "utf8"),
  ]);
  for (const channel of ["feishu", "dingtalk", "wechat", "telegram"]) {
    assert.match(icons, new RegExp(`\\"${channel}\\":\\"<svg`));
  }
  assert.match(js, /window\.ComoteChannelIcons/);
  assert.match(js, /function channelIconHtml/);
});

test("narrow-window layout has one responsive system and a stable sidebar", async () => {
  const css = await readFile("public/styles.css", "utf8");

  assert.doesNotMatch(css, /@media \(max-width: 960px\)/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.nav-list\s*\{[^}]*flex-flow:\s*row nowrap/);
  assert.match(css, /\.nav-item > span:not\(\.nav-count\)[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.command-row\s*\{[^}]*grid-template-columns:\s*minmax\(190px, 1fr\) minmax\(0, 2fr\)/s);
});

test("color theme follows the operating system without JavaScript state", async () => {
  const [css, js] = await Promise.all([
    readFile("public/styles.css", "utf8"),
    readFile("dist/public/app.js", "utf8"),
  ]);

  assert.match(css, /:root\s*\{[^}]*color-scheme:\s*light dark/s);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{[^}]*--canvas:\s*#[0-9a-f]{6}/s);
  for (const variable of ["surface", "ink", "line", "teal", "success", "warning", "error"]) {
    assert.match(css, new RegExp(`@media \\(prefers-color-scheme: dark\\)[\\s\\S]*--${variable}:`));
  }
  assert.doesNotMatch(js, /prefers-color-scheme|matchMedia\([^)]*color-scheme/i);
});
