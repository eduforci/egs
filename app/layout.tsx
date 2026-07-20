import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EGS — by EDUFORCI",
  description: "Gestion scolaire pour établissements en Côte d'Ivoire",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
