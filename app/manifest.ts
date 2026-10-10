import type { MetadataRoute } from "next";

/** Install / home-screen icon and name when staff add the app to a phone or desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Synergy Feedback",
    short_name: "Synergy",
    description: "Feedback and forms platform for Synergy Wellness.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#02334c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
