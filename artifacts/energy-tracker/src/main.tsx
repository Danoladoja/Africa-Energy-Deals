// Global admin auth interceptor — attaches Bearer token to all /api/admin calls,
// and on 401 clears stale tokens + redirects to the admin login page.
const _origFetch = window.fetch;
window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/api/admin')) {
    const token = localStorage.getItem('afrienergy_admin_token');
    if (token) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers };
    }
  }
  const response = await _origFetch.call(window, input, init);
  if (response.status === 401 && url.includes('/api/admin')) {
    localStorage.removeItem('afrienergy_admin_token');
    localStorage.removeItem('afrienergy_session_token');
    // Use BASE_URL so the redirect is correct in both dev (/energy-tracker/) and prod (/)
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    window.location.replace(`${base}/admin`);
    // Return the actual response — NOT a never-resolving promise — so that
    // every caller's .finally() / catch() still executes and isLoading clears.
  }
  return response;
};

import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";
createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
