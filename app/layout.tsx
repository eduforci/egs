import type { Metadata } from "next";
import "./globals.css";
import { LangueProvider } from "@/lib/i18n/provider";
import LangueFlottante from "@/components/langue-flottante";

export const metadata: Metadata = {
  title: "EGS — by EDUFORCI",
  description: "Gestion scolaire pour établissements en Côte d'Ivoire",
};

// Appliqué avant l'affichage : la langue et le sens d'écriture choisis (arabe : de droite à gauche)
// sont déjà en place quand la page apparaît, sans attendre le chargement de React.
const SCRIPT_LANGUE = `(function(){try{var l=localStorage.getItem('egs_langue');if(l&&/^(fr|en|es|de|pt|zh|ar)$/.test(l)){document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_LANGUE }} />
      </head>
      <body>
        <LangueProvider>
          <LangueFlottante />
          {children}
        </LangueProvider>
      </body>
    </html>
  );
}
