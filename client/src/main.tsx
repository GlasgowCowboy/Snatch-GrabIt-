import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker for PWA install + shell caching. Production
// only — in dev Vite HMR fights with a SW caching responses, and we'd be
// chasing ghost "why isn't my edit showing" bugs.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal — the app still works without a SW.
    });
  });
}
