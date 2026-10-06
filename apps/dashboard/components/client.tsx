"use client";

import { Check, Copy, Moon, Sun } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function ago(ts: number, now: number) {
  const s = Math.max(0, now - ts);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function useNow(initial: number) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Ago({ ts, serverNow }: { ts: number; serverNow: number }) {
  const now = useNow(serverNow);
  const iso = new Date(ts * 1000).toISOString();
  return (
    <time dateTime={iso} title={iso.replace("T", " ").slice(0, 19) + " UTC"} suppressHydrationWarning>
      {ago(ts, now)}
    </time>
  );
}

/** Re-fetches server data on an interval while the tab is visible. */
export function LiveRefresh({ every = 15, generatedAt }: { every?: number; generatedAt: number }) {
  const router = useRouter();
  const now = useNow(generatedAt);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every * 1000);
    return () => clearInterval(t);
  }, [every, router]);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-3" aria-live="off">
      <span aria-hidden className="beat size-1.5 rounded-full bg-pass" />
      <span suppressHydrationWarning>Synced {ago(generatedAt, now)}</span>
    </span>
  );
}

export function CopyHash({ value, display }: { value: string; display: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      title={value}
      aria-label={`Copy ${value}`}
      className="group inline-flex items-center gap-1 rounded font-mono text-xs text-ink-2 hover:text-ink active:translate-y-px"
    >
      {display}
      {done ? (
        <Check aria-hidden className="size-3 text-pass" />
      ) : (
        <Copy aria-hidden className="size-3 opacity-40 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

export function ThemeToggle() {
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("attesta-theme", next);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink active:scale-95"
    >
      <Moon aria-hidden className="size-4 dark:hidden" />
      <Sun aria-hidden className="hidden size-4 dark:block" />
    </button>
  );
}

const NAV = [
  { href: "/", label: "Fleet" },
  { href: "/timeline", label: "Timeline" },
  { href: "/auditor", label: "Auditor" },
];

export function Nav({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/agents") : path.startsWith(href));
  if (variant === "top") {
    return (
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {NAV.map(n => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${active(n.href) ? "bg-ink text-bg" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-3">
        {NAV.map(n => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? "page" : undefined}
            className={`py-3.5 text-center text-sm font-medium ${active(n.href) ? "text-ink" : "text-ink-3"}`}
          >
            <span className={active(n.href) ? "border-b-2 border-ink pb-1" : ""}>{n.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
