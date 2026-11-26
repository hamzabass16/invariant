import type { MetadataRoute } from "next";

/**
 * The web app's manifest, so a phone can add Invariant to its Home Screen
 * (an iPhone sends a web app notifications only from there) and the
 * notification after a close opens it (lib/push.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Invariant",
    short_name: "Invariant",
    description: "Your portfolio, judged by your own methodology.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icon-256.png", sizes: "256x256", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
