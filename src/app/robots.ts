import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Auth flows, account settings, messages, and the admin dashboard
        // are all viewer-specific or private -- nothing a crawler should
        // index, and /admin in particular shouldn't be advertised as an
        // existing path at all.
        disallow: [
          "/admin",
          "/settings",
          "/messages",
          "/notifications",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/onboarding",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
