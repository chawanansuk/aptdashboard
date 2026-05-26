import type { NextConfig } from "next";

/**
 * Security headers — defense in depth (Task 15).
 *
 * Conservative set: every header here is well-known and won't break
 * the existing app. NOT included (deferred — high risk of silent
 * breakage that we don't want to discover at 3am):
 *
 *   - Content-Security-Policy — could break NextAuth OAuth popup,
 *     Next inline hydration scripts, Vercel preview banner, recharts
 *     inline styles. Needs proper allowlist + scripted manual testing.
 *
 * Included:
 *   - X-Frame-Options: DENY — block clickjacking via iframe embed
 *   - X-Content-Type-Options: nosniff — block MIME type sniffing
 *   - Referrer-Policy: strict-origin-when-cross-origin — leak less
 *   - Permissions-Policy — explicitly deny APIs we don't use
 *   - Strict-Transport-Security — force HTTPS (Vercel adds this but
 *     being explicit makes audit easier)
 *   - poweredByHeader: false — remove "x-powered-by: Next.js"
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      // Google profile photos (used by next-auth Google provider)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
