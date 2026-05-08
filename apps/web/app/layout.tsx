import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chez Therese et Denise",
  description: "Plateforme SaaS de gestion de restaurant",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "CTD",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#050505",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
