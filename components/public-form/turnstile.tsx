"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Cloudflare Turnstile widget (privacy-friendly CAPTCHA). */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
        appearance: "interaction-only",
      });
    };
    if (window.turnstile) render();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!s) {
        s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken]);
  return <div ref={ref} className="min-h-0" />;
}
