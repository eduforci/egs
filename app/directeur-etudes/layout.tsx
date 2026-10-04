import DirecteurLayout from '@/app/directeur/layout';

// Les pages de /directeur-etudes (DESPS, AGFNE, établissement...) utilisent le même menu
// que l'espace directeur.
export default function DirecteurEtudesLayout({ children }: { children: React.ReactNode }) {
  return <DirecteurLayout>{children}</DirecteurLayout>;
}
