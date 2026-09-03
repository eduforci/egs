'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type NavItem = { label: string; href: string; icon: string };
type NavGroup = { titre: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    titre: 'TABLEAU DE BORD',
    items: [{ label: 'Accueil', href: '/chef/dashboard', icon: '🏠' }],
  },
  {
    titre: 'GESTION',
    items: [
      { label: 'Classes', href: '/chef/classes', icon: '🏫' },
      { label: 'Enseignants', href: '/chef/enseignants', icon: '👨‍🏫' },
      { label: 'Élèves', href: '/chef/eleves', icon: '🎓' },
{ label: 'Répartir en classes', href: '/chef/eleves/repartition', icon: '🔀' },
      { label: 'Parents', href: '/chef/parents', icon: '👨‍👩‍👧' },
      { label: 'Personnel', href: '/chef/personnel', icon: '🧑‍💼' },
      { label: 'Emploi du temps', href: '/direction/emploi-du-temps', icon: '📅' },
      { label: 'Examens', href: '/chef/examens', icon: '📝' },
      { label: 'Bulletins', href: '/chef/bulletins', icon: '📄' },
    ],
  },
  {
    titre: 'FINANCES',
    items: [
      { label: 'Comptabilité', href: '/chef/comptabilite', icon: '💰' },
      { label: 'Relances impayés', href: '/direction/relances', icon: '📨' },
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
  {
    titre: 'COMMUNICATION',
    items: [{ label: 'Messagerie', href: '/direction/messagerie', icon: '💬' }],
  },
];

const ROLE_LABELS: Record<string, string> = {
  chef: "Chef d'établissement",
  directeur_etudes: 'Directeur des études',
};

export default function ChefLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = createClient();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [role, setRole] = useState('');
  const [etablissementNom, setEtablissementNom] = useState('');

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

  const estVisiteurDirecteur = role === 'directeur_etudes';

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* SIDEBAR DESKTOP (visible md+) / DRAWER MOBILE (toggle) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-neutral-900 text-white transform transition-transform duration-200 md:translate-x-0 md:static md:flex md:flex-col ${
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

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          {NAV_GROUPS.map((groupe) => (
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
            <div className="text-neutral-400">{ROLE_LABELS[role] || 'Chef d\'établissement'}</div>
          </div>
        </div>
      </aside>

      {menuOuvert && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMenuOuvert(false)}
        />
      )}

      {/* CONTENU PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* CONTENU PRINCIPAL */}
        <header className="bg-white border-b sticky top-0 z-20 px-4 py-3 flex items-center gap-3 print:hidden">
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

        {/* BANDEAU — visible uniquement si un directeur des études visite une page partagée avec le chef */}
        {estVisiteurDirecteur && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap print:hidden">
            <p className="text-xs text-blue-800">
              Vous consultez cette page en tant que <strong>Directeur des études</strong> — elle est partagée avec l'espace chef.
            </p>
            <Link
              href="/directeur/dashboard"
              className="text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2 whitespace-nowrap"
            >
              ← Retour à mon espace
            </Link>
          </div>
        )}

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
