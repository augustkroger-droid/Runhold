import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Runhold GPS-test",
    short_name: "Runhold",
    description: "Mobilt GPS-test med mål, retur och Supabase-sparning.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#101820",
    theme_color: "#101820",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
