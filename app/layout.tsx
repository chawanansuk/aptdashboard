import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Dashboard หอพัก",
    description: "ระบบจัดการหอพัก 5 ตึก",
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
          <html lang="th">
                <body className="bg-[#F0F2F5] text-[#111827] min-h-screen antialiased" style={{ fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" }}>
                  {children}
                </body>body>
          </html>html>
        );
}
</html>
