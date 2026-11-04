import http from "node:http";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import updateHandler from "../api/update.js";

// Reproduce the historical cache-first worker, then exercise the real repair
// route and production worker with browser storage intact and an old tab open.
let obsolete = true;
const oldHtml =
  "<!doctype html><html><title>Ancienne App TV</title><body>Ancienne version conservée</body></html>";
const oldWorker = `self.addEventListener('install',e=>e.waitUntil(caches.open('prive-obsolete').then(c=>c.add('/old-index.html')).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.pathname.startsWith('/api/'))return;if(e.request.mode==='navigate')e.respondWith(caches.open('prive-obsolete').then(c=>c.match('/old-index.html')));});`;
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  res.setHeader("Cache-Control", "no-store");
  if (path === "/api/update") {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.send = (body) => res.end(body);
    return updateHandler(req, res);
  }
  if (path.startsWith("/api/")) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Connexion requise." }));
  }
  if (path === "/old-index.html" || (obsolete && path === "/")) {
    res.setHeader("Content-Type", "text/html");
    return res.end(oldHtml);
  }
  if (path === "/sw.js" && obsolete) {
    res.setHeader("Content-Type", "text/javascript");
    return res.end(oldWorker);
  }
  const file = path === "/" ? "/index.html" : path;
  if (file.includes("..")) {
    res.writeHead(400);
    return res.end();
  }
  try {
    const data = await readFile(new URL("../dist" + file, import.meta.url));
    const ext = file.split(".").pop();
    res.setHeader(
      "Content-Type",
      {
        js: "text/javascript",
        html: "text/html",
        css: "text/css",
        png: "image/png",
        svg: "image/svg+xml",
        webmanifest: "application/manifest+json",
      }[ext] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
    localStorage.setItem(
      "app-tv:device-unlock:v1:test-account",
      "encrypted-record-preserved",
    );
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("AppTvUpdateTest", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("data");
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("data", "readwrite");
        tx.objectStore("data").put("legacy-vault-preserved", "vault");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  assert.equal(await page.title(), "Ancienne App TV");
  const oldTab = await context.newPage();
  await oldTab.goto(origin);
  obsolete = false;
  await page.goto(origin + "/api/update");
  await page.getByRole("main", { name: "Connexion SCDR TV" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("setup"), "face-id");
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("app-tv:device-unlock:v1:test-account"),
    ),
    "encrypted-record-preserved",
  );
  const vault = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("AppTvUpdateTest");
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("data");
          const get = tx.objectStore("data").get("vault");
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
        };
      }),
  );
  assert.equal(vault, "legacy-vault-preserved");
  assert.equal(await oldTab.title(), "Ancienne App TV");
  await page.reload();
  await page.getByRole("main", { name: "Connexion SCDR TV" }).waitFor();
  console.log(
    "PASS: old cache-first worker bypassed, new worker activated with old tab open, current app after reload, Face ID setup intent, localStorage and IndexedDB preserved.",
  );
} finally {
  await browser.close();
  server.close();
}
