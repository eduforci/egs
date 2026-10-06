'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type NavItem = { label: string; href: string; icon: string };
type NavGroup = { titre: string; items: NavItem[] };

// Visible uniquement pour le compte administration : création des comptes de l'école
const GROUPE_COMPTES: NavGroup = {
  titre: "COMPTES DE L'ÉCOLE",
  items: [
    { label: 'Nouveau membre du personnel', href: '/chef/personnel/nouveau', icon: '➕' },
    { label: 'Nouvel élève', href: '/chef/eleves/nouveau', icon: '🎓' },
  ],
};

const NAV_GROUPS: NavGroup[] = [
  {
    titre: 'TABLEAU DE BORD',
    items: [
      { label: 'Accueil', href: '/directeur/dashboard', icon: '🏠' },
      { label: 'Mon profil', href: '/directeur/profil', icon: '👤' },
    ],
  },
  {
    titre: 'GESTION',
    items: [
      { label: 'Classes', href: '/chef/classes', icon: '🏫' },
      { label: 'Élèves', href: '/chef/eleves', icon: '🎓' },
      { label: 'Enseignants', href: '/chef/enseignants', icon: '🧑‍🏫' },
      { label: 'Répartir en classes', href: '/chef/eleves/repartition', icon: '🔀' },
      { label: 'Parents', href: '/chef/parents', icon: '👨‍👩‍👧' },
      { label: 'Personnel', href: '/chef/personnel', icon: '🧑‍💼' },
      { label: 'Emploi du temps', href: '/direction/emploi-du-temps', icon: '📅' },
      { label: 'Grille horaire', href: '/direction/emploi-du-temps/grille', icon: '⏰' },
      { label: 'Établissement', href: '/direction/etablissement', icon: '🏛️' },
      { label: 'Examens', href: '/chef/examens', icon: '📝' },
      { label: 'Bulletins', href: '/chef/bulletins', icon: '📄' },
    ],
  },
  {
    titre: 'SUIVI PÉDAGOGIQUE',
    items: [
      { label: 'Validation des notes', href: '/directeur/notes-validation', icon: '✔️' },
      { label: 'Résultats', href: '/directeur/resultats', icon: '🏆' },
      { label: 'Absences', href: '/directeur/absences', icon: '🚫' },
    ],
  },
  {
    titre: 'ADMINISTRATION OFFICIELLE',
    items: [
      { label: 'Statistiques DESPS', href: '/directeur-etudes/desps', icon: '📈' },
      { label: 'Code établissement', href: '/directeur-etudes/etablissement', icon: '🏷️' },
    ],
  },
  {
    titre: 'AGFNE',
    items: [
      { label: 'Élèves sans matricule', href: '/directeur-etudes/agfne/sans-matricule', icon: '❓' },
      { label: 'Comparer (GAP)', href: '/directeur-etudes/agfne/comparer', icon: '🔍' },
      { label: 'Suivi immatriculation', href: '/directeur-etudes/agfne/immatriculation', icon: '🆔' },
      { label: 'Transferts', href: '/directeur-etudes/agfne/transferts', icon: '🔁' },
    ],
  },
  {
    titre: 'FINANCES',
    items: [
      { label: 'Comptabilité', href: '/chef/comptabilite', icon: '💰' },
    ],
  },
  {
    titre: 'COMMUNICATION SMS',
    items: [
      { label: 'Message libre', href: '/directeur/sms/message', icon: '💬' },
      { label: 'Relances impayés', href: '/directeur/sms/relances', icon: '📨' },
      { label: 'Messagerie', href: '/direction/messagerie', icon: '💬' },
    ],
  },
  {
    titre: 'POINTAGE',
    items: [
      { label: 'Badger', href: '/pointage', icon: '👆' },
      { label: 'Configuration', href: '/direction/pointage/configuration', icon: '⚙️' },
      { label: 'Suivi du jour', href: '/direction/pointage/suivi', icon: '📋' },
      { label: 'Justifications', href: '/direction/pointage/justifications', icon: '✅' },
      { label: 'Rapports', href: '/direction/pointage/rapports', icon: '📊' },
    ],
  },
  {
    titre: 'DOCUMENTS',
    items: [
      { label: 'Documents élèves', href: '/direction/documents', icon: '📁' },
      { label: 'Documents enseignants', href: '/direction/documents-enseignants', icon: '📁' },
    ],
  },
];

export default function DirecteurLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = createClient();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [etablissementNom, setEtablissementNom] = useState('');
  const [role, setRole] = useState('');
  const [fonction, setFonction] = useState('');

  const groupesAffiches =
    role === 'administration'
      ? [NAV_GROUPS[0], GROUPE_COMPTES, ...NAV_GROUPS.slice(1)]
      : NAV_GROUPS;

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('nom, prenom, role, etablissement_id')
        .eq('id', userData.user.id)
        .single();

      setNom(profil?.nom || '');
      setPrenom(profil?.prenom || '');
      setRole(profil?.role || '');

      // Fonction lue à part : sans effet sur le reste si la colonne n'existe pas encore
      const { data: f } = await supabase
        .from('profiles')
        .select('fonction')
        .eq('id', userData.user.id)
        .single();
      setFonction((f as any)?.fonction || '');

      if (profil?.etablissement_id) {
        const { data: etab } = await supabase
          .from('etablissements')
          .select('nom')
          .eq('id', profil.etablissement_id)
          .single();
        setEtablissementNom(etab?.nom || '');
      }
    };
    charger();
  }, [supabase]);

  useEffect(() => {
    setMenuOuvert(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-neutral-900 text-white flex flex-col transform transition-transform duration-200 md:translate-x-0 md:static ${
          menuOuvert ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-neutral-800 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white text-neutral-900 flex items-center justify-center font-bold">
            E
          </div>
          <div>
            <div className="font-semibold text-sm">EGS</div>
            <div className="text-xs text-neutral-400">École Gestion System</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain py-4 px-2 space-y-5">
          {groupesAffiches.map((groupe) => (
            <div key={groupe.titre}>
              <div className="px-3 mb-1 text-[10px] font-semibold text-neutral-500 tracking-wider">
                {groupe.titre}
              </div>
              <div className="space-y-0.5">
                {groupe.items.map((item) => {
                  const actif = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                        actif
                          ? 'bg-white text-neutral-900 font-medium'
                          : 'text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-neutral-800 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-xs font-medium">
            {prenom.charAt(0)}{nom.charAt(0)}
          </div>
          <div className="text-xs">
            <div className="font-medium">{prenom} {nom}</div>
            <div className="text-neutral-400">
              {fonction ||
                (role === 'administration'
                ? 'Administration'
                : role === 'chef'
                ? "Chef d'établissement"
                : 'Directeur des études')}
            </div>
          </div>
        </div>
      </aside>

      {menuOuvert && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden overscroll-none touch-none"
          onClick={() => setMenuOuvert(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b sticky top-0 z-20 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMenuOuvert(true)}
            className="md:hidden text-2xl leading-none"
            aria-label="Ouvrir le menu"
          >
            ☰
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-neutral-400 truncate">{etablissementNom}</div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
