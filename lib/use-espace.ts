'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ESPACES_CODES, espaceDeClasse, estEspaceValide, type EspaceCode } from '@/lib/espaces';

const CLE_STOCKAGE = 'egs_espace_actif';
const EVENEMENT = 'egs-espace-change';

type Contexte = { actifs: EspaceCode[]; disponibles: EspaceCode[] };

let cache: Promise<Contexte> | null = null;

function lireChoix(): string {
  try {
    return window.localStorage.getItem(CLE_STOCKAGE) || '';
  } catch {
    return '';
  }
}

function ecrireChoix(valeur: string) {
  try {
    if (valeur) window.localStorage.setItem(CLE_STOCKAGE, valeur);
    else window.localStorage.removeItem(CLE_STOCKAGE);
  } catch {
    /* navigation privée : le choix ne sera simplement pas mémorisé */
  }
}

async function chargerContexte(): Promise<Contexte> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { actifs: [], disponibles: [] };

  const { data: profil } = await supabase
    .from('profiles')
    .select('role, etablissement_id')
    .eq('id', userData.user.id)
    .single();
  if (!profil?.etablissement_id) return { actifs: [], disponibles: [] };

  // Lectures séparées : si le script SQL « espaces » n'est pas installé, l'école reste à un seul espace.
  const { data: etab, error: erreurEtab } = await supabase
    .from('etablissements')
    .select('espaces_actifs')
    .eq('id', profil.etablissement_id)
    .single();
  const brut = erreurEtab ? [] : (((etab as any)?.espaces_actifs as string[] | null) ?? []);
  const actifs = ESPACES_CODES.filter((c) => brut.includes(c));

  let autorises: string[] | null = null;
  if (profil.role !== 'administration' && profil.role !== 'super_admin') {
    const { data: droits, error: erreurDroits } = await supabase
      .from('profiles')
      .select('espaces_autorises')
      .eq('id', userData.user.id)
      .single();
    if (!erreurDroits) autorises = ((droits as any)?.espaces_autorises as string[] | null) ?? null;
  }

  const disponibles =
    autorises && autorises.length > 0 ? actifs.filter((c) => autorises!.includes(c)) : actifs;
  return { actifs, disponibles };
}

// Espaces de travail de l'utilisateur et espace actuellement choisi.
// Une école à un seul espace n'est jamais filtrée : rien ne change pour elle.
export function useEspace() {
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [choix, setChoix] = useState('');

  useEffect(() => {
    if (!cache) cache = chargerContexte().catch(() => ({ actifs: [], disponibles: [] }));
    let vivant = true;
    cache.then((c) => {
      if (vivant) setContexte(c);
    });
    setChoix(lireChoix());
    const surChangement = () => setChoix(lireChoix());
    window.addEventListener(EVENEMENT, surChangement);
    return () => {
      vivant = false;
      window.removeEventListener(EVENEMENT, surChangement);
    };
  }, []);

  const changerEspace = useCallback((valeur: string) => {
    ecrireChoix(valeur);
    window.dispatchEvent(new Event(EVENEMENT));
  }, []);

  const actifs = contexte?.actifs ?? [];
  const disponibles = contexte?.disponibles ?? [];
  const filtrer = actifs.length > 1;
  const espace: EspaceCode | '' = estEspaceValide(choix) && disponibles.includes(choix) ? choix : '';
  const visibles: EspaceCode[] = espace ? [espace] : disponibles;

  const classeVisible = useCallback(
    (cycle: string | null | undefined, type: string | null | undefined, niveau?: string | null) =>
      !filtrer || visibles.includes(espaceDeClasse(cycle, type, niveau)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtrer, visibles.join(',')]
  );

  return {
    pret: contexte !== null,
    filtrer,
    actifs,
    disponibles,
    espace,
    visibles,
    changerEspace,
    classeVisible,
  };
      }
     
