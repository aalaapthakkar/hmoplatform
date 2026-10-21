import type { MetadataRoute } from "next";

/** Lets tenants add the portal to their phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Your home: tenant portal",
    short_name: "My home",
    description: "Your rent, documents, repairs and messages with your letting team.",
    id: "/portal",
    start_url: "/portal",
    scope: "/portal",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en-GB",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
