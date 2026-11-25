import type { NextConfig } from "next";

/**
 * Sent with every response. A full script CSP would need per-request nonces for
 * Next's inline scripts, so the policy here only covers framing; the rest are
 * cheap defaults with no effect on the app.
 */
const SECURITY_HEADERS = [
  // Nobody may frame Jiji, so its buttons can't be clickjacked.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  // The app never uses next/image, so switch off the /_next/image optimizer, an
  // unauthenticated endpoint with a history of advisories (GHSA-2464-fhr4-w9xw).
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
