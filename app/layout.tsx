import type { Metadata } from "next";
import "./globals.css";
import { publicOrigin } from "../lib/runtime";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: "Agenda Realess",
  description:
    "Organize o dia, acompanhe compromissos e planeje a semana na agenda da Realess. Reserve uma sala de reunião quando precisar.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Agenda Realess",
    images: [
      {
        url: "/realess-social.jpeg",
        width: 1080,
        height: 1080,
        alt: "Realess · Cobranças Empresariais",
      },
    ],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
