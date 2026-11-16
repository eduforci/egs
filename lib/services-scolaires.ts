// Outils communs aux espaces Cantine et Transport.
import type { SupabaseClient } from '@supabase/supabase-js';

export type ContexteEcole = { etablissementId: string; anneeActive: string };

export type EleveLite = {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  classe_nom: string;
};

export const PERIODICITES_CANTINE: Record<string, string> = {
  jour: 'par jour',
  semaine: 'par semaine',
  mois: 'par mois',
  trimestre: 'par trimestre',
  annee: 'par an',
};

export const PERIODICITES_TRANSPORT: Record<string, string> = {
  mois: 'par mois',
  trimestre: 'par trimestre',
  annee: 'par an',
};

export const SENS_TRANSPORT: Record<string, string> = {
  aller_retour: 'Aller et retour',
  aller: 'Aller seulement',
  retour: 'Retour seulement',
};

// Charge l'établissement de l'utilisateur connecté et l'année scolaire active.
export async function chargerContexteEcole(supabase: SupabaseClient): Promise<ContexteEcole> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié.');

  const { data: profil, error: profilErreur } = await supabase
    .from('profiles')
    .select('etablissement_id')
    .eq('id', user.id)
    .single();
  if (profilErreur) throw new Error(`Erreur profil : ${profilErreur.message}`);
  if (!profil?.etablissement_id) throw new Error("Aucun établissement n'est associé à ce compte.");

  const { data: annees } = await supabase
    .from('annees_scolaires')
    .select('libelle, active')
    .eq('etablissement_id', profil.etablissement_id)
    .order('libelle', { ascending: false });

  let anneeActive: string = annees?.find((a: any) => a.active)?.libelle || annees?.[0]?.libelle || '';

  if (!anneeActive) {
    const { data: etab } = await supabase
      .from('etablissements')
      .select('annee_scolaire_active')
      .eq('id', profil.etablissement_id)
      .single();
    anneeActive = (etab as any)?.annee_scolaire_active || '';
  }
  if (!anneeActive) throw new Error("Aucune année scolaire active n'est configurée.");

  return { etablissementId: profil.etablissement_id, anneeActive };
}

// Liste des élèves de l'établissement, triés par nom.
export async function chargerEleves(supabase: SupabaseClient, etablissementId: string): Promise<EleveLite[]> {
  const { data, error } = await supabase
    .from('eleves')
    .select('id, matricule, nom, prenom, classes(nom)')
    .eq('etablissement_id', etablissementId);
  if (error) throw new Error(`Erreur élèves : ${error.message}`);

  return ((data ?? []) as any[])
    .map((e) => {
      const cl = Array.isArray(e.classes) ? e.classes[0] : e.classes;
      return {
        id: e.id as string,
        nom: (e.nom || '') as string,
        prenom: (e.prenom || '') as string,
        matricule: (e.matricule ?? null) as string | null,
        classe_nom: (cl?.nom ?? '-') as string,
      };
    })
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
}

export function nomComplet(e: { nom: string; prenom: string } | undefined): string {
  return e ? `${e.nom} ${e.prenom}`.trim() || 'Sans nom' : 'Élève inconnu';
}

export function formatMontant(n: number | null | undefined): string {
  return `${(n ?? 0).toLocaleString('fr-FR')} F`;
}

// Date locale au format AAAA-MM-JJ (sans décalage de fuseau horaire).
export function versIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
}

export function aujourdhui(): string {
  return versIso(new Date());
}

export function depuisIso(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j);
}

export function ajouterJours(iso: string, n: number): string {
  const d = depuisIso(iso);
  d.setDate(d.getDate() + n);
  return versIso(d);
}

export function lundiDeLaSemaine(iso: string): string {
  const d = depuisIso(iso);
  const jour = d.getDay(); // 0 = dimanche
  d.setDate(d.getDate() - (jour === 0 ? 6 : jour - 1));
  return versIso(d);
}

export function dateLongue(iso: string): string {
  return depuisIso(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function heureCourte(h: string | null | undefined): string {
  return h ? h.slice(0, 5) : '';
}
