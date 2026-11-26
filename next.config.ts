import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: import.meta.dirname,
  // The demo reads its fictional samples at runtime: ship them with every route.
  // The study PDF is set in Space Grotesk from public/fonts, read by path at render time.
  outputFileTracingIncludes: {
    "/**": ["./data/samples/*", "./public/fonts/*"],
  },
  // react-pdf renders on the server as a Node package; bundling it breaks its font loading.
  serverExternalPackages: ["@react-pdf/renderer"],
  // A methodology document is uploaded through a server action (up to 4 MB: Vercel caps a request body at 4.5 MB).
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" },
    // A screen visited in the last five minutes opens from the browser's own copy at once; the person's
    // figures change at most a few times a day, and any save (each calls revalidatePath) clears the copy.
    // Nothing is kept on the server: the copy lives in that browser tab's memory only.
    staleTimes: { dynamic: 300, static: 300 },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Portfolio data: never indexed, never framed, never cached by a proxy.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // The earnings report's page is embedded by the app's own screens, and only by them.
        source: "/api/earnings/deck",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // The public site (app/site, drawn at / for anyone signed out) holds no one's data and may be found.
        source: "/:site(site)?",
        headers: [{ key: "X-Robots-Tag", value: "all" }],
      },
      {
        // The icons hold no data. Claude draws a connector's icon from its domain's favicon through
        // Google's favicon service, which reads a classic favicon.ico and skips files it may not index.
        source: "/:icon(favicon\\.ico|icon\\.svg|icon-256\\.png|apple-icon\\.png)",
        headers: [
          { key: "X-Robots-Tag", value: "all" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
