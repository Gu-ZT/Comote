import { defineComponent, h } from "vue";
import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";

const RoutePage = defineComponent({
  name: "RoutePage",
  render: () => h("span", { hidden: true }),
});

export const PAGE_ROUTES = [
  { path: "/connect-phone", name: "connectPhone", meta: { page: "connectPhone" } },
  { path: "/users", name: "users", meta: { page: "users" } },
  { path: "/phone-commands", name: "phoneCommands", meta: { page: "phoneCommands" } },
  { path: "/approvals", name: "approvals", meta: { page: "approvals" } },
  { path: "/conversation", name: "conversation", meta: { page: "conversation" } },
  { path: "/logs", name: "logs", meta: { page: "logs" } },
  { path: "/settings", alias: "/advanced", name: "settings", meta: { page: "settings" } },
  { path: "/about", name: "about", meta: { page: "about" } },
] as const;

const legacyHashes: Record<string, string> = {
  connectPhone: "/connect-phone",
  users: "/users",
  phoneCommands: "/phone-commands",
  approvals: "/approvals",
  conversation: "/conversation",
  logs: "/logs",
  settings: "/settings",
  advanced: "/settings",
  about: "/about",
  codexNotice: "/connect-phone",
  readiness: "/connect-phone",
};

const legacyHash = window.location.hash.slice(1);
if (legacyHashes[legacyHash]) {
  history.replaceState(null, "", `#${legacyHashes[legacyHash]}`);
}

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/connect-phone" },
  ...PAGE_ROUTES.map((route) => ({ ...route, component: RoutePage })),
  { path: "/:pathMatch(.*)*", redirect: "/connect-phone" },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  linkActiveClass: "active",
  linkExactActiveClass: "active",
});
