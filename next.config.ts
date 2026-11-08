import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  // Native shared libraries (Windows DLLs / Linux libvips) are loaded by
  // sharp at runtime and can be omitted by static dependency tracing.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@img/sharp-*/lib/**/*"],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default config;
