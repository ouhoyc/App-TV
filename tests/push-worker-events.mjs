import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const events = {},
  notifications = [],
  actions = [];
const self = {
  location: { origin: "https://app-tv-alpha.vercel.app" },
  addEventListener(name, fn) {
    events[name] = fn;
  },
  registration: {
    async showNotification(title, options) {
      notifications.push({ title, ...options });
    },
  },
  clients: {
    async matchAll() {
      return [
        {
          async focus() {
            actions.push("focus");
          },
          postMessage(value) {
            actions.push(value);
          },
        },
      ];
    },
    async openWindow(url) {
      actions.push(url);
    },
  },
};
vm.runInNewContext(
  await readFile(new URL("../dist/sw.js", import.meta.url), "utf8"),
  { self, URL, caches: {}, fetch() {} },
);
let wait;
events.push({
  data: {
    json: () => ({
      title: "SCDR TV",
      body: "Un test est terminé.",
      tag: "same-reminder",
      url: "/?client=80000000-0000-4000-8000-000000000001",
    }),
  },
  waitUntil(p) {
    wait = p;
  },
});
await wait;
assert.equal(notifications.length, 1);
assert.equal(notifications[0].tag, "same-reminder");
assert.equal(notifications[0].renotify, false);
events.notificationclick({
  notification: {
    close() {},
    data: { url: "/?client=80000000-0000-4000-8000-000000000001" },
  },
  waitUntil(p) {
    wait = p;
  },
});
await wait;
assert.equal(actions[0], "focus");
assert.equal(actions[1].type, "SCDR_OPEN_CLIENT");
assert.equal(actions[1].clientId, "80000000-0000-4000-8000-000000000001");
events.notificationclick({
  notification: { close() {}, data: { url: "https://attacker.invalid" } },
  waitUntil(p) {
    wait = p;
  },
});
await wait;
assert.equal(actions.length, 2);
self.clients.matchAll = async () => [];
events.notificationclick({
  notification: {
    close() {},
    data: { url: "/?client=80000000-0000-4000-8000-000000000001" },
  },
  waitUntil(p) {
    wait = p;
  },
});
await wait;
assert.match(actions[2], /^https:\/\/app-tv-alpha.vercel.app\//);
console.log(
  "PASS: background push displays native notification, stable tag, focus and authorized deeplink without reloading an open form; foreign origins denied.",
);
