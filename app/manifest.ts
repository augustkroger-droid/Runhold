import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Runhold",
    short_name: "Runhold",
    description: "Runhold: gå på uppdrag, samla resurser och bygg ditt läger.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#101820",
    theme_color: "#101820",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/runhold-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/runhold-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
