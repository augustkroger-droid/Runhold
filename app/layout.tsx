import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runhold",
  description: "Runhold: gå på uppdrag, samla resurser och bygg ditt läger.",
  icons: {
    icon: "/icons/runhold-app-icon-192.png",
    apple: "/icons/runhold-app-icon-180.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Runhold",
  },
};

export const viewport: Viewport = {
  themeColor: "#101820",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
