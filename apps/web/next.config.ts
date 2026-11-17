import type { NextConfig } from "next";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const config: NextConfig = {
  transpilePackages: ["@verdict/shared"],
  // Browser calls go to /api/* on the same origin, so the session cookie is
  // first-party and no CORS setup is needed.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
  images: { remotePatterns: [{ hostname: "image.tmdb.org" }, { hostname: "images.igdb.com" }] },
};

export default config;
