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
    items: [{ label: 'Accueil', href: '/parent/dashboard', icon: '🏠' }],
  },
  {
    titre: 'SUIVI',
    items: [
      { label: 'Bulletins', href: '/parent/bulletins', icon: '📄' },
      { label: 'Absences', href: '/absences', icon: '📋' },
      { label: 'Emploi du temps', href: '/emploi-du-temps', icon: '📅' },
    ],
  },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = createClient();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [etablissementNom, setEtablissementNom] = useState('');

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('nom, prenom, etablissement_id')
        .eq('id', userData.user.id)
        .single();

      setNom(profil?.nom || '');
      setPrenom(profil?.prenom || '');

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
            <div className="text-neutral-400">Parent</div>
          </div>
        </div>
      </aside>

      {menuOuvert && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
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
