import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/forms/", "/privacy", "/terms"], disallow: ["/admin", "/api", "/auth"] }],
  };
}
