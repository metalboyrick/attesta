import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Link from "next/link";
import { Nav, ThemeToggle } from "@/components/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "Attesta",
  description: "Continuous compliance evidence for AI agents that move money on-chain.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
};

// Runs before paint so the stored or system theme applies without a flash.
const themeScript = `try{var t=localStorage.getItem("attesta-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-[100dvh] font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-20 border-b border-rule bg-bg/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Attesta home">
              <span aria-hidden className="grid size-6 place-items-center rounded-[5px] bg-ink text-[13px] font-semibold text-bg">
                A
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Attesta</span>
            </Link>
            <div className="flex items-center gap-2">
              <Nav variant="top" />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-10">
          {children}
        </main>
        <Nav variant="bottom" />
      </body>
    </html>
  );
}
