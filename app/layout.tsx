import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Realess · Agenda e salas",
  description: "Um espaço para organizar a agenda da Realess, reservar salas e conectar a equipe.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
