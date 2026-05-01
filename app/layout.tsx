import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard หอพัก",
  description: "ระบบจัดการห้อง 5 ตึก",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className="antialiased"
        style={{
          fontFamily:
            '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
          background: "#F0F2F5",
          color: "#111827",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
