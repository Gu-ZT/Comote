import type { Project } from "../types.js";

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/");
}

export class ProjectStore {
  readonly _pathToId: Map<string, string>;
  private _nextId: number;
  private projects: Project[];

  constructor({ projects = [] }: { projects?: Array<Partial<Project> & { path: string }> } = {}) {
    // Stable id map: path -> id, so the same path always gets the same number
    // across refreshes (critical for /open <number> stability).
    this._pathToId = new Map();
    this._nextId = 1;
    this.projects = [];
    this._replace(projects);
  }

  // Replace the full project list with a fresh set from Codex Desktop.
  // Paths that were seen before keep their existing id; new paths get the
  // next sequential id.
  replaceProjects(list: Array<Partial<Project> & { path: string }>): void {
    this._replace(list);
  }

  _replace(list: Array<Partial<Project> & { path: string }>): void {
    const next: Project[] = [];
    for (const project of list) {
      const path = normalizePath(project.path);
      let id = this._pathToId.get(path);
      if (id === undefined) {
        id = String(this._nextId++);
        this._pathToId.set(path, id);
      }
      next.push({
        id,
        name: project.name ?? path.split("/").filter(Boolean).at(-1) ?? path,
        path,
        source: project.source ?? "codex-desktop",
        status: project.status ?? "available",
      });
    }
    this.projects = next;
  }

  listProjects(): Project[] {
    return this.projects.map((project) => ({ ...project }));
  }

  resolveProject(selector: string): Project {
    if (isAbsolutePath(selector)) {
      const path = normalizePath(selector);
      return {
        id: "path",
        name: path.split("/").filter(Boolean).at(-1) ?? path,
        path,
        source: "direct",
        status: "available",
      };
    }

    const project = this.listProjects().find((candidate) => candidate.id === selector);
    if (!project) {
      throw new Error(`找不到项目：${selector}`);
    }
    return project;
  }
}
