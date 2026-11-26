"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";

import { STEALTH_COOKIE, maskMoney, publicPath } from "@/lib/stealth";
import { cn } from "@/lib/utils";

const EVENT = "pos-stealth";
const isOn = () => typeof document !== "undefined" && document.documentElement.dataset.stealth === "on";

function setStealth(on: boolean) {
  document.cookie = `${STEALTH_COOKIE}=${on ? "on" : "off"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  if (on) document.documentElement.dataset.stealth = "on";
  else delete document.documentElement.dataset.stealth;
  window.dispatchEvent(new Event(EVENT));
}

function useStealth(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    isOn,
    () => false,
  );
}

/**
 * The stealth switch (Hamza, 19 Oct 2026): beside Settings on a laptop, in
 * the nav bar on a phone. On, every amount of the person's own money reads
 * ••••• (lib/stealth.ts); a company's or a market's stays, and percentages
 * stay. Kept on this device alone.
 */
export function StealthToggle({ compact = false }: { compact?: boolean }) {
  const on = useStealth();
  const Icon = on ? EyeOff : Eye;
  const label = on ? "Show amounts" : "Hide amounts";
  return (
    <button type="button" onClick={() => setStealth(!on)} aria-pressed={on} aria-label={label} title={`${label} (stealth mode)`} className={cn(compact ? "inline-flex size-9 items-center justify-center rounded-full text-text-secondary hover:text-text" : "top-item", on && "text-accent-text")}>
      <Icon className="size-4 shrink-0" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
      {compact ? null : <span className="sr-only">{label}</span>}
    </button>
  );
}

/**
 * Masks every amount of money in the page while stealth is on, and puts each
 * back when it goes off: text and the hover titles alike, the charts' own
 * labels included, and whatever the page draws later (a live price, a new
 * screen), through one observer. The originals stay in memory alone.
 */
export function StealthMask() {
  const on = useStealth();
  const path = usePathname();
  React.useEffect(() => {
    if (!on) {
      document.body.dataset.stealthReady = "1";
      return;
    }
    // Only the person's own money (Hamza, 7 Nov 2026): a public screen keeps its amounts but what is marked private; any other hides all but what is marked public.
    const everyAmount = !publicPath(path);
    const hides = (el: Element | null) => !!el && (!!el.closest("[data-private]") || (everyAmount && !el.closest("[data-public]")));
    const texts = new Map<Text, { orig: string; masked: string }>();
    const titles = new Map<Element, { orig: string; masked: string }>();
    const maskText = (n: Text) => {
      const v = n.nodeValue ?? "";
      const seen = texts.get(n);
      if (seen && seen.masked === v) return;
      const masked = hides(n.parentElement) ? maskMoney(v) : v;
      if (masked === v) {
        texts.delete(n);
        return;
      }
      texts.set(n, { orig: v, masked });
      n.nodeValue = masked;
    };
    const maskTitle = (el: Element) => {
      const v = el.getAttribute("title");
      if (v === null) return;
      const seen = titles.get(el);
      if (seen && seen.masked === v) return;
      const masked = hides(el) ? maskMoney(v) : v;
      if (masked === v) return;
      titles.set(el, { orig: v, masked });
      el.setAttribute("title", masked);
    };
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return maskText(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const el = root as Element;
      if (el.closest("script,style,noscript")) return;
      maskTitle(el);
      el.querySelectorAll("[title]").forEach(maskTitle);
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const p = n.parentElement;
        if (p && (p.tagName === "SCRIPT" || p.tagName === "STYLE")) continue;
        maskText(n as Text);
      }
    };
    walk(document.body);
    document.body.dataset.stealthReady = "1";
    const observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") maskText(m.target as Text);
        else if (m.type === "attributes") maskTitle(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title"] });
    return () => {
      observer.disconnect();
      for (const [n, { orig, masked }] of texts) if (n.nodeValue === masked) n.nodeValue = orig;
      for (const [el, { orig, masked }] of titles) if (el.getAttribute("title") === masked) el.setAttribute("title", orig);
    };
  }, [on, path]);
  return null;
}
