import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function frontendSources() {
  const [app, controller, router, main, connectPhone, users, phoneCommands, approvals, conversation, logs, settings, about, css] = await Promise.all([
    readFile("public/App.vue", "utf8"),
    readFile("public/app.ts", "utf8"),
    readFile("public/router.ts", "utf8"),
    readFile("public/main.ts", "utf8"),
    readFile("public/components/ConnectPhonePage.vue", "utf8"),
    readFile("public/components/UsersPage.vue", "utf8"),
    readFile("public/components/PhoneCommandsPage.vue", "utf8"),
    readFile("public/components/ApprovalsPage.vue", "utf8"),
    readFile("public/components/ConversationPage.vue", "utf8"),
    readFile("public/components/LogsPage.vue", "utf8"),
    readFile("public/components/SettingsPage.vue", "utf8"),
    readFile("public/components/AboutPage.vue", "utf8"),
    readFile("public/styles.css", "utf8"),
  ]);
  const pages = [connectPhone, users, phoneCommands, approvals, conversation, logs, settings, about].join("\n");
  return { app, controller, router, main, connectPhone, phoneCommands, conversation, settings, about, pages, css };
}

test("Vue Router drives every exclusive sidebar page", async () => {
  const { app, router, main, pages, css } = await frontendSources();
  const links = [...app.matchAll(/<RouterLink class="nav-item[^"]*" to="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(links, [
    "/connect-phone",
    "/users",
    "/phone-commands",
    "/approvals",
    "/conversation",
    "/logs",
    "/settings",
    "/about",
  ]);
  for (const page of ["connectPhone", "users", "phoneCommands", "approvals", "conversation", "logs", "settings", "about"]) {
    assert.match(pages, new RegExp(`id="${page}"`));
    assert.match(app, new RegExp(`<\\w+Page :active="isPage\\('${page}'\\)"`));
    assert.match(router, new RegExp(`meta: \\{ page: "${page}" \\}`));
  }
  assert.match(router, /createWebHashHistory\(\)/);
  assert.match(main, /app\.use\(router\)/);
  assert.doesNotMatch(main + router, /addEventListener\("hashchange"/);
  assert.match(css, /\.app-page\.active\s*\{\s*display:\s*block/);
  assert.doesNotMatch(css, /--ui-zoom|zoom:\s*var\(--ui-zoom\)/);
});

test("Vue application shell keeps product and operational page structure", async () => {
  const { app, connectPhone } = await frontendSources();

  assert.match(app, /<h1 class="top-title">\{\{ t\("web\.top\.title"\) \}\}<\/h1>/);
  assert.match(app, /<img class="brand-logo" src="\/icon\.png"/);
  assert.match(connectPhone, /id="updateNotice"/);
  assert.match(connectPhone, /id="codexNotice"/);
  assert.match(connectPhone, /id="channelCards"/);
});

test("conversation history keeps its project tree and split reader", async () => {
  const { conversation, controller, router, css } = await frontendSources();

  assert.match(conversation, /id="conversationTree" class="conversation-tree" role="tree"/);
  assert.match(conversation, /id="conversationMessages" class="conversation-messages"/);
  assert.match(conversation, /id="conversationMessageList" class="conversation-message-list"/);
  assert.doesNotMatch(conversation, /id="conversationList"/);
  assert.match(controller, /async function loadOlderConversationMessages/);
  assert.match(controller, /prependedTranscriptScrollTop/);
  assert.match(router, /path: "\/conversation"/);
  assert.match(css, /body\[data-active-page="conversation"\]\s*\{[^}]*height:\s*100vh[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.conversation-browser\s*\{[^}]*grid-template-columns:\s*300px minmax\(0, 1fr\)/s);
  assert.match(css, /\.conversation-message-user\s*\{[^}]*flex-direction:\s*row-reverse/s);
  assert.match(css, /\.conversation-tree\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.conversation-messages\s*\{[^}]*overflow-y:\s*auto/s);
});

test("dynamic identity and channel text remains constrained", async () => {
  const { controller, css } = await frontendSources();

  assert.match(controller, /class="identity-id" title=/);
  assert.match(css, /\.list-row-copy\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.identity-meta \.identity-id\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.channel-row-head \.ch-summary[\s\S]*text-overflow:\s*ellipsis/);
});

test("desktop approvals keep all three decisions", async () => {
  const { controller, css } = await frontendSources();
  const dictionary = await readFile("src/i18n/en-US.json", "utf8");

  assert.match(controller, /\|acceptForSession/);
  assert.match(dictionary, /web\.approvals\.acceptForSession/);
  assert.match(controller, /class="list-row approval-row"/);
  assert.match(css, /\.approval-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.approval-actions\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("phone commands remain complete and copyable", async () => {
  const { app, controller, phoneCommands, css } = await frontendSources();

  assert.match(app, /<PhoneCommandsPage :active="isPage\('phoneCommands'\)"/);
  assert.match(phoneCommands, /id="phoneCommandList" class="command-list"/);
  assert.match(phoneCommands, /const PHONE_COMMANDS: readonly PhoneCommand\[\] = \[/);
  for (const command of ["help", "status", "current", "projects", "open", "sessions", "use", "switch", "tail", "new", "file", "automode", "model", "cancel", "approve", "deny"]) {
    assert.match(phoneCommands, new RegExp(`id: "${command}"`));
  }
  assert.match(phoneCommands, /v-for="command in PHONE_COMMANDS"/);
  assert.match(phoneCommands, /navigator\.clipboard\.writeText/);
  assert.match(phoneCommands, /document\.execCommand\("copy"\)/);
  assert.doesNotMatch(controller, /phoneCommandList|renderPhoneCommands/);
  assert.match(css, /\.command-row:hover[^\{]*\.command-tooltip/);
  assert.match(css, /\.command-description\s*\{[^}]*text-overflow:\s*ellipsis/s);
});

test("settings page keeps persistent connector and retry controls", async () => {
  const { settings, controller, router, css } = await frontendSources();

  assert.match(settings, /id="preferredConnector" class="segmented-selector"/);
  assert.match(settings, /name="preferredConnector" value="desktop"/);
  assert.match(settings, /name="preferredConnector" value="cli"/);
  assert.match(settings, /id="capacityRetryEnabled" type="checkbox" role="switch"/);
  assert.match(settings, /id="capacityRetryLimit" type="number" min="1" max="100"/);
  assert.match(controller, /capacityRetryEnabled: next\.enabled/);
  assert.match(controller, /capacityRetryLimit: next\.limit/);
  assert.match(router, /path: "\/settings", alias: "\/advanced"/);
  assert.match(css, /\.settings-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 760px\)[^}]*justify-content:\s*center/s);
});

test("about page and desktop external links remain wired", async () => {
  const { about, controller, css } = await frontendSources();
  const config = await readFile("src-tauri/tauri.conf.json", "utf8");

  assert.match(about, /<div class="about-grid">/);
  assert.match(css, /\.about-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 760px\)[^}]*justify-content:\s*center/s);
  assert.match(controller, /const canInvokeTauri = typeof window\.__TAURI__\?\.core\?\.invoke === "function"/);
  assert.match(controller, /if \(canInvokeTauri\)/);
  assert.match(config, /"withGlobalTauri"\s*:\s*true/);
});

test("channel cards use local brand SVG icons", async () => {
  const { controller } = await frontendSources();
  const icons = await readFile("public/vendor/channel-icons.js", "utf8");

  for (const channel of ["feishu", "dingtalk", "wechat", "telegram"]) {
    assert.match(icons, new RegExp(`\\"${channel}\\":\\"<svg`));
  }
  assert.match(controller, /window\.ComoteChannelIcons/);
  assert.match(controller, /function channelIconHtml/);
});

test("responsive layout and system color theme remain stable", async () => {
  const { css, main } = await frontendSources();

  assert.doesNotMatch(css, /@media \(max-width: 960px\)/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.nav-list\s*\{[^}]*flex-flow:\s*row nowrap/);
  assert.match(css, /:root\s*\{[^}]*color-scheme:\s*light dark/s);
  for (const variable of ["surface", "ink", "line", "teal", "teal-surface", "success", "warning", "error"]) {
    assert.match(css, new RegExp(`@media \\(prefers-color-scheme: dark\\)[\\s\\S]*--${variable}:`));
  }
  assert.doesNotMatch(main, /prefers-color-scheme|matchMedia\([^)]*color-scheme/i);
});
