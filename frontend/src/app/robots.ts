import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/booking", "/manage-booking", "/ar/booking", "/ar/manage-booking", "/bn/booking", "/bn/manage-booking"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
