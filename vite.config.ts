import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { version as appVersion } from "./package.json";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "private-offline-shell",
      generateBundle(_, bundle) {
        const files = [
          "/",
          "/index.html",
          "/manifest.webmanifest",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
          "/apple-touch-icon.png",
          ...Object.keys(bundle).map((f) => "/" + f),
        ];
        const version = JSON.stringify("prive-" + appVersion + "-" + Date.now());
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const CACHE=${version}; const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('prive-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(caches.open(CACHE).then(c=>c.match('/index.html')).then(r=>r||fetch(e.request)));return;}if(FILES.includes(u.pathname))e.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname)).then(r=>r||fetch(e.request)));});
`,
        });
      },
    },
  ],
});
