import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Agenda Realess",
  description: "Organize o dia, acompanhe compromissos e planeje a semana na agenda da Realess. Reserve uma sala de reunião quando precisar.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
