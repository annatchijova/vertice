import type { Metadata } from "next";
import "@/styles/tokens.css";
import "@/styles/components.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Vértice OPS",
  description: "Pagos a proveedores: la IA investiga, el código decide, vos firmás.",
};

// Fuentes por <link> (igual que los mockups): next/font falla al bajar Google Fonts en algunos entornos de build.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <Providers>
          <div className="vx-root" data-theme="light" style={{ minHeight: "100vh" }}>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
