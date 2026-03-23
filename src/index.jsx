import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tailwind.css";
import "./styles/index.css";

/** En dev, quita SW previos (p. ej. tras `vite preview` o pruebas PWA) para no servir bundles viejos. */
if (import.meta.env.DEV && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

const container = document.getElementById("root");
const root = createRoot(container);

root.render(<App />);
