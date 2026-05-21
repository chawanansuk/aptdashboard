import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWAClient from "@/components/PWAClient";
import SessionProviderClient from "@/components/SessionProviderClient";
import HealthBanner from "@/components/HealthBanner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Toaster } from "sonner";
import { auth } from "@/auth";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Dashboard หอพัก",
  description: "ระบบจัดการห้อง 5 ตึก v2",
  manifest: "/manifest.json",
  applicationName: "ApartCloud",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ApartCloud",
  },
  icons: {
    icon: [
      { url: "/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.svg", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4F46E5" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="th">
      <head>
        {/* Warm TCP+TLS to Google avatar CDN before <Image> request — saves ~50-100ms on first profile pic load */}
        <link rel="preconnect" href="https://lh3.googleusercontent.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
      </head>
      <body className="antialiased" style={{ minHeight: "100vh" }}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        {/* Skip-to-main-content link — keyboard-only users (Tab from address
            bar) get to bypass the header/sidebar nav. CSS .ac-skip-link
            hides off-screen until focused. */}
        <a href="#main-content" className="ac-skip-link">
          ข้ามไปยังเนื้อหาหลัก
        </a>
        <SessionProviderClient session={session}>
          <PWAClient />
          <HealthBanner />
          {/* Global error boundary — catches anything that escapes per-route
              boundaries so the user never faces a blank white screen. */}
          <ErrorBoundary level="global">{children}</ErrorBoundary>
          {/* Single Toaster mount-point. `lib/toast.ts` is the wrapper —
              call toast.success/error/info from anywhere. */}
          <Toaster
            position="top-right"
            richColors
            theme="system"
            offset={16}
            gap={8}
          />
        </SessionProviderClient>
      </body>
    </html>
  );
}
