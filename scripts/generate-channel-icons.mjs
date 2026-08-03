import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Lark = require("@icon-park/svg/lib/icons/Lark.js").default;
const Wechat = require("@icon-park/svg/lib/icons/Wechat.js").default;
const Telegram = require("@icon-park/svg/lib/icons/Telegram.js").default;
const antDesignIcons = require("@iconify-json/ant-design/icons.json");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "public/vendor/channel-icons.js");

function normalizeIcon(svg) {
  return svg
    .replace(/^<\?xml[^>]+>/, "")
    .replace('<svg width="24" height="24"', '<svg width="24" height="24" aria-hidden="true" focusable="false"');
}

function antDesignSvg(name) {
  const body = antDesignIcons.icons?.[name]?.body;
  if (!body) throw new Error(`Missing Ant Design icon: ${name}`);
  return `<svg width="24" height="24" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
}

export async function generateChannelIcons(output = OUTPUT) {
  const icons = {
    feishu: normalizeIcon(Lark({ size: "24" })),
    dingtalk: antDesignSvg("dingtalk-outlined"),
    wechat: normalizeIcon(Wechat({ size: "24" })),
    telegram: normalizeIcon(Telegram({ size: "24" })),
  };
  const source = `// Generated from @icon-park/svg (Apache-2.0) and @iconify-json/ant-design (MIT).\nwindow.ComoteChannelIcons = Object.freeze(${JSON.stringify(icons)});\n`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, source, "utf8");
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateChannelIcons();
}
