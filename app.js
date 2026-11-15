/* SJ link-drop proxy frontend — Scramjet 1.1 + BareMux.
   Same wiring as the proven xboxcloud proxy, minus Xbox/PIN/UV code.
   The page works from any directory on any static host: every path below
   is resolved relative to this page's own URL. */

// Backend Bare server. Override per-link with ?bare=https://host/bare/
const DEFAULT_BARE_URL = "https://barelink-landons-projects-e458b478.vercel.app/bare/";
const BARE_URL =
  new URLSearchParams(location.search).get("bare") || DEFAULT_BARE_URL;

const DIR = new URL(".", location.href).pathname; // this page's directory, ends with "/"
const SW_URL = new URL("sw.js", location.href).pathname;
const WORKER_ENTRY = new URL("vendor/baremux/worker-entry.js", location.href).pathname;
const TRANSPORT_URL = new URL("vendor/baremod/transport.mjs", location.href).pathname;
const PREFIX = DIR + "scramjet/";
const FILES = {
  wasm: new URL("vendor/scram/scramjet.wasm.wasm", location.href).pathname,
  all: new URL("vendor/scram/scramjet.all.js", location.href).pathname,
  sync: new URL("vendor/scram/scramjet.sync.js", location.href).pathname,
};
const HOME_URL = "https://duckduckgo.com";

const $ = (id) => document.getElementById(id);
const urlInput = $("url");
const statusEl = $("status");
const backBtn = $("backBtn");
const fwdBtn = $("fwdBtn");
const reloadBtn = $("reloadBtn");

let controller = null;
let frame = null;
let iframe = null;
let ready = false;

function setStatus(t, err) {
  statusEl.textContent = t;
  statusEl.className = err ? "err" : "";
}

// Turn bar input into a URL: full URL stays, bare domain gets https://,
// anything else becomes a DuckDuckGo search.
function normalizeInput(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v)) return "https://" + v;
  return "https://duckduckgo.com/?q=" + encodeURIComponent(v);
}

function decodeFrameUrl(rawHref) {
  try {
    const u = new URL(rawHref, location.origin);
    if (u.pathname.startsWith(PREFIX)) {
      return decodeURIComponent(u.pathname.slice(PREFIX.length)) + (u.hash || "");
    }
  } catch {
    /* ignore */
  }
  return "";
}

function syncAddressBar() {
  if (!iframe) return;
  let raw = "";
  try {
    raw = iframe.contentWindow.location.href || "";
  } catch {
    raw = "";
  }
  if (!raw || raw.startsWith("about:")) raw = iframe.src || "";
  const real = decodeFrameUrl(raw);
  if (real && real !== urlInput.value && document.activeElement !== urlInput) {
    urlInput.value = real;
  }
  if (real) {
    try {
      history.replaceState(null, "", "#" + real);
    } catch {
      /* ignore */
    }
  }
}

function go(raw) {
  const target = normalizeInput(raw);
  if (!target || !frame) return;
  setStatus("loading…");
  frame.go(target);
  urlInput.blur();
}

$("goBtn").onclick = () => go(urlInput.value);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") go(urlInput.value);
});
backBtn.onclick = () => frame && frame.back();
fwdBtn.onclick = () => frame && frame.forward();
reloadBtn.onclick = () => frame && frame.reload();
$("fsBtn").onclick = () => {
  if (!iframe) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (iframe.requestFullscreen) iframe.requestFullscreen();
  else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
};

async function ensureServiceWorkerReady() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Workers require HTTPS or localhost.");
  }
  await navigator.serviceWorker.register(SW_URL, { scope: DIR });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      setTimeout(resolve, 1500);
    });
  }
}

async function init() {
  try {
    setStatus("loading engine…");
    const { ScramjetController } = $scramjetLoadController();
    controller = new ScramjetController({
      prefix: PREFIX,
      files: FILES,
      flags: {
        serviceworkers: false,
        syncxhr: false,
        sourcemaps: false,
        scramitize: false,
        allowInvalidJs: true,
        allowFailedIntercepts: true,
      },
    });
    await controller.init();

    setStatus("registering worker…");
    await ensureServiceWorkerReady();

    setStatus("connecting…");
    const bareConnection = new BareMux.BareMuxConnection(WORKER_ENTRY);
    await bareConnection.setTransport(TRANSPORT_URL, [BARE_URL]);

    iframe = document.createElement("iframe");
    iframe.setAttribute(
      "allow",
      "fullscreen; autoplay; encrypted-media; camera; microphone; gamepad; pointer-lock"
    );
    $("frames").appendChild(iframe);
    frame = controller.createFrame(iframe);
    iframe.addEventListener("load", syncAddressBar);
    setInterval(syncAddressBar, 500);

    backBtn.disabled = false;
    fwdBtn.disabled = false;
    reloadBtn.disabled = false;
    ready = true;

    const hashTarget = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
    const start = /^https?:\/\//i.test(hashTarget) ? hashTarget : HOME_URL;
    setStatus("ready");
    frame.go(start);
  } catch (e) {
    console.error("[SJ] init failed:", e);
    setStatus("failed: " + (e && e.message ? e.message : e), true);
  }
}

init();
