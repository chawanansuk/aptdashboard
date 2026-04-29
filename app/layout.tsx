import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  weight: ["400", "500"],
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dashboard หอพัก",
  description: "ระบบดูแลงานหอพัก 5 ตึก",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={ibmPlexSansThai.className}>
      <body className="bg-gray-50 dark:bg-gray-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
