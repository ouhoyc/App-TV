import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AccountApp from "./AccountApp";
import { initializeTheme } from "./ThemeToggle";
import { configureAppViewport } from "./appViewport";
import "./style.css";

initializeTheme();
configureAppViewport();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {import.meta.env.VITE_LEGACY_MODE === "enabled" ? <App /> : <AccountApp />}
  </React.StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => window.dispatchEvent(new Event("offline-unavailable")));
  });
