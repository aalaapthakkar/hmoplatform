"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that lets the portal be installed on a phone
 * and shows a friendly page when there's no signal. It never stores
 * anything personal: see public/sw.js.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/portal" }).catch(() => {
      // Without it the portal still works; it just can't show the offline page.
    });
  }, []);
  return null;
}
