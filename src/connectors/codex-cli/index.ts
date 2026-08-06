import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import { resolveCodexCommand } from "../codex-desktop/index.js";
import { resolveCodexLaunch, spawnEnvFor } from "../codex-desktop/json-rpc.js";

const defaultExecFileAsync = promisify(execFile);

function parseJsonLines(stdout) {
  let threadId = null;
  let lastMessage = "";
  let parsedAny = false;
  for (const line of String(stdout ?? "").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const event = JSON.parse(line);
      parsedAny = true;
      if (event.type === "thread.started") {
        threadId = event.thread_id ?? event.threadId ?? threadId;
      }
      const item = event.item;
      if (event.type === "item.completed" && item?.type === "agent_message") {
        lastMessage = item.text ?? lastMessage;
      }
    } catch {
      // A pre-JSON Codex CLI may still print plain text; preserve it below.
    }
  }
  return {
    threadId,
    output: parsedAny ? lastMessage.trim() : String(stdout ?? "").trim(),
  };
}

export class CodexCliConnector {
  // Shares the desktop connector's executable resolution: a GUI-launched app
  // has a minimal PATH, so bare "codex" misses nvm/Homebrew installs.
  private readonly execFileAsync: typeof defaultExecFileAsync;
  private readonly resolveLaunch: typeof resolveCodexLaunch;
  readonly command: string;
  private readonly exists: typeof existsSync;

  constructor({
    execFileAsync = defaultExecFileAsync,
    resolveLaunch = resolveCodexLaunch,
    command = null,
    exists = existsSync,
  }: {
    execFileAsync?: typeof defaultExecFileAsync;
    resolveLaunch?: typeof resolveCodexLaunch;
    command?: string | null;
    exists?: typeof existsSync;
  } = {}) {
    this.execFileAsync = execFileAsync;
    this.resolveLaunch = resolveLaunch;
    this.command = command ?? resolveCodexCommand();
    this.exists = exists;
  }

  getStatus() {
    // A resolved absolute path can be verified on disk; a bare command can
    // only be resolved by the OS at spawn time, so it stays optimistic.
    const missing = isAbsolute(this.command) && !this.exists(this.command);
    return {
      name: "Codex CLI",
      role: "fallback",
      state: missing ? "not_found" : "available",
      command: this.command,
    };
  }

  async runPrompt({ cwd, text, images = [], resumeId = null }) {
    const args = ["exec", "--skip-git-repo-check", "-C", cwd];
    if (resumeId) {
      args.push("resume", "--json");
    } else {
      args.push("--json");
    }
    if (images.length > 0) {
      // `codex exec --image` accepts a comma-separated list of local paths, so
      // forwarded image attachments reach Codex as real images.
      args.push("--image", images.join(","));
    }
    if (resumeId) {
      args.push(resumeId);
    }
    args.push(text);
    const launch = this.resolveLaunch(this.command);
    const { stdout, stderr } = await this.execFileAsync(launch.command, [...launch.args, ...args], {
      maxBuffer: 1024 * 1024 * 8,
      env: spawnEnvFor(launch.command),
    });
    const parsed = parseJsonLines(stdout);
    return {
      id: parsed.threadId ?? resumeId ?? `cli_${randomUUID()}`,
      cwd,
      text,
      output: parsed.output || String(stderr ?? "").trim(),
    };
  }
}
