import MenuUtilisateur from '@/components/menu-utilisateur';

export default function EnseignantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b sticky top-0 z-20 px-4 py-2 flex justify-end print:hidden">
        <MenuUtilisateur parametresHref="/prof/profil" />
      </header>
      {children}
    </div>
  );
}