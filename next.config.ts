import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // TMDB poster/backdrop CDN
      { protocol: "https", hostname: "image.tmdb.org" },
      // Supabase Storage (avatars, uploads)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
