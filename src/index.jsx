import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tailwind.css";
import "./styles/index.css";

/** Quita SW/caches previos: el sitio ya no registra PWA en la config activa de Vite. */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

if (typeof window !== "undefined" && "caches" in window) {
  caches.keys?.().then((keys) => {
    keys.forEach((key) => caches.delete(key));
  });
}

document.getElementById("go-seo-fallback")?.remove();

const container = document.getElementById("root");
const root = createRoot(container);

root.render(<App />);
