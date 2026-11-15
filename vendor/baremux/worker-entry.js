/* BareMux worker entry — loads the shared worker code next to this file. */
importScripts("./worker.js");

self.addEventListener("message", (event) => {
  if (event.data && event.data.__xcpConnect && event.data.port && typeof self.onconnect === "function") {
    self.onconnect({ ports: [event.data.port] });
  }
});
