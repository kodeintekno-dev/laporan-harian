import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <header className="app-brand">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="m8 13 2.5 2.5L16 10" />
      </svg>
      Staff Kodein
    </header>
    <App />
  </StrictMode>,
);
