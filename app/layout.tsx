import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runhold",
  description: "Ett mobilt tekniskt GPS-test för ett framtida löparspel.",
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
