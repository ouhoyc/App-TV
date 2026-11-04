import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { APP_VERSION } from "./src/version";

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
          "/scdr-tv-logo.webp",
          "/scdr-tv-screen.webp",
          "/scdr-tv-192.png",
          "/scdr-tv-512.png",
          "/scdr-tv-maskable.png",
          "/scdr-tv-apple-touch.png",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
          "/apple-touch-icon.png",
          ...Object.keys(bundle).map((f) => "/" + f),
        ];
        const version = JSON.stringify("prive-" + APP_VERSION + "-" + Date.now());
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const CACHE=${version}; const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();if(e.data?.type==='APP_TV_UPDATE_CHECK')e.ports[0]?.postMessage({networkNavigation:true});});
// Keep prior static caches for tabs with unsaved work; never reload open forms.
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}if(FILES.includes(u.pathname))e.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname)).then(r=>r||fetch(e.request)));});
self.addEventListener('push',e=>{let p;try{p=e.data.json();}catch{return;}e.waitUntil(self.registration.showNotification(String(p.title||'SCDR TV').slice(0,80),{body:String(p.body||'').slice(0,300),icon:'/scdr-tv-192.png',badge:'/scdr-tv-192.png',tag:String(p.tag||'scdr-reminder').slice(0,100),renotify:false,data:{url:typeof p.url==='string'?p.url:'/'}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{let target;try{target=new URL(e.notification.data?.url||'/',self.location.origin);}catch{return;}if(target.origin!==self.location.origin)return;const open=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(open.length){await open[0].focus();open[0].postMessage({type:'SCDR_OPEN_CLIENT',clientId:target.searchParams.get('client')});}else await self.clients.openWindow(target.href);})());});
`,
        });
      },
    },
  ],
});
