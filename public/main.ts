import { createApp, nextTick } from "vue";

import "./vendor/channel-icons.js";
import App from "./App.vue";
import { applyTranslations, i18n } from "./i18n.js";
import { router } from "./router.js";

const app = createApp(App);
app.use(router);
app.use(i18n);

await router.isReady();
app.mount("#app");
await nextTick();
applyTranslations(document);

// The existing API controller is loaded only after Vue owns the application
// shell, so its incremental channel/log/conversation painters keep their state
// while the surrounding views migrate to components.
await import("./app.js");
