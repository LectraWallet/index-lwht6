/* global $scramjetLoadWorker */
/* SJ link-drop proxy ServiceWorker — Scramjet 1.1 only, no allowlist.
   Paths resolve relative to this worker's own URL, so the zip works
   from any directory on any static host. */

const DIR = new URL(".", self.location.href).pathname;
const PREFIX = DIR + "scramjet/";

// Pre-seed Scramjet's IndexedDB stores + a public-suffix fallback list so
// cookie handling works even before the live PSL fetch completes.
(function ensureScramjetStoresAndPsl() {
  try {
    const req = indexedDB.open("$scramjet", 1);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      for (const name of [
        "config",
        "cookies",
        "redirectTrackers",
        "referrerPolicies",
        "publicSuffixList",
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction("publicSuffixList", "readwrite");
        const store = tx.objectStore("publicSuffixList");
        const getReq = store.get("publicSuffixList");
        getReq.onsuccess = () => {
          if (!getReq.result || Date.now() >= (getReq.result.expiry || 0)) {
            store.put(
              {
                data: [
                  "com", "net", "org", "edu", "gov", "io", "app", "dev",
                  "gg", "me", "xyz", "site", "online", "top", "club", "fun",
                  "live", "shop", "store", "tech", "co", "us", "uk", "ca",
                  "au", "de", "fr", "jp", "kr", "br", "ru", "in", "it", "es",
                  "nl", "se", "no", "fi", "pl", "tr", "ua", "vn", "th", "id",
                  "ph", "my", "sg", "hk", "tw", "cn", "nz", "za", "mx", "ar",
                  "cl", "pe", "co.uk", "org.uk", "com.au", "com.br", "co.jp",
                  "co.kr", "com.mx", "com.cn", "azureedge.net", "azurefd.net",
                  "azurewebsites.net", "akamaized.net", "trafficmanager.net",
                  "msedge.net", "footprintdns.com", "githubusercontent.com",
                  "github.io", "vercel.app", "surge.sh", "workers.dev",
                  "pages.dev", "netlify.app", "jsdelivr.net",
                ],
                expiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
              },
              "publicSuffixList"
            );
          }
        };
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      } catch {
        db.close();
      }
    };
  } catch {
    // ignore
  }
})();

importScripts("./vendor/scram/scramjet.all.js");

self.addEventListener(
  "message",
  (event) => {
    if (event.data && event.data.scramjet$type === "loadConfig") {
      event.stopImmediatePropagation();
      if (typeof scramjet !== "undefined") {
        scramjet.config = undefined;
        scramjet.loadConfig().catch(() => {});
      }
    }
  },
  true
);

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  let pathname = "";
  try {
    const parsed = new URL(event.request.url);
    if (parsed.origin !== self.location.origin) return;
    pathname = parsed.pathname;
  } catch {
    return;
  }
  if (!pathname.startsWith(PREFIX)) return; // local files pass through

  event.respondWith(
    (async () => {
      try {
        await scramjet.loadConfig();
        if (scramjet.route(event)) {
          return await scramjet.fetch(event);
        }
      } catch (err) {
        console.error("[SJ ServiceWorker] Proxy route error:", err);
      }
      return fetch(event.request);
    })()
  );
});
