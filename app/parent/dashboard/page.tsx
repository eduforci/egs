'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Enfant = {
  id: string;
  nom: string;
  prenom: string;
  classe_nom: string;
  matricule: string;
  absencesNonJustifiees: number;
  moyenneGenerale: number | null;
  soldeAPayer: number;
};

function trimestreActuel(): number {
  const mois = new Date().getMonth() + 1; // 1-12
  if (mois >= 9 || mois <= 12) return 1;
  if (mois >= 1 && mois <= 3) return 2;
  return 3;
}

export default function DashboardParent() {
  const supabase = createClient();
  const [prenom, setPrenom] = useState('');
  const [etablissementNom, setEtablissementNom] = useState('');
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('prenom, etablissement_id')
        .eq('id', userData.user.id)
        .single();

      if (!profil?.etablissement_id) {
        setErreur("Établissement introuvable pour ce compte.");
        setLoading(false);
        return;
      }

      setPrenom(profil.prenom || '');

      const { data: etab } = await supabase
        .from('etablissements')
        .select('nom, annee_scolaire_active')
        .eq('id', profil.etablissement_id)
        .single();
      setEtablissementNom(etab?.nom || '');

      const anneeScolaire = etab?.annee_scolaire_active || '';
      const trimestre = trimestreActuel();

      const { data: liens, error: liensError } = await supabase
        .from('parents_eleves')
        .select('eleve_id, eleves(id, matricule, classe_id, classes(nom))')
        .eq('parent_id', userData.user.id);

      if (liensError) {
        setErreur(liensError.message);
        setLoading(false);
        return;
      }

      const idsEleves = (liens || []).map((l: any) => l.eleve_id);
      const { data: profs } = idsEleves.length > 0
        ? await supabase.from('profiles').select('id, nom, prenom').in('id', idsEleves)
        : { data: [] };
      const profsParId = new Map((profs || []).map((p) => [p.id, p]));

      const { data: absencesData } = idsEleves.length > 0
        ? await supabase
            .from('absences')
            .select('eleve_id, justifie')
            .in('eleve_id', idsEleves)
            .eq('type', 'absence')
            .eq('justifie', false)
        : { data: [] };

      const compteurAbsences = new Map<string, number>();
      (absencesData || []).forEach((a) => {
        compteurAbsences.set(a.eleve_id, (compteurAbsences.get(a.eleve_id) || 0) + 1);
      });

      // Solde à payer : somme des frais dus pour l'année active, tous frais confondus
      const { data: fraisData } = idsEleves.length > 0
        ? await supabase
            .from('frais_scolarite')
            .select('eleve_id, montant_total, montant_paye')
            .in('eleve_id', idsEleves)
            .eq('annee_scolaire', anneeScolaire)
        : { data: [] };

      const soldeParEleve = new Map<string, number>();
      (fraisData || []).forEach((f) => {
        const reste = Number(f.montant_total || 0) - Number(f.montant_paye || 0);
        soldeParEleve.set(f.eleve_id, (soldeParEleve.get(f.eleve_id) || 0) + Math.max(reste, 0));
      });

      // Moyenne générale : on réutilise generer_bulletin (même logique que les bulletins officiels)
      const moyenneParEleve = new Map<string, number | null>();
      await Promise.all(
        idsEleves.map(async (eleveId) => {
          try {
            const { data: bulletin } = await supabase.rpc('generer_bulletin', {
              p_eleve_id: eleveId,
              p_trimestre: trimestre,
              p_annee_scolaire: anneeScolaire,
            });
            const moyenne = (bulletin as any)?.moyenne_generale ?? null;
            moyenneParEleve.set(eleveId, typeof moyenne === 'number' ? moyenne : null);
          } catch {
            moyenneParEleve.set(eleveId, null);
          }
        })
      );

      const liste: Enfant[] = (liens || []).map((l: any) => {
        const p = profsParId.get(l.eleve_id);
        return {
          id: l.eleve_id,
          nom: p?.nom || '',
          prenom: p?.prenom || '',
          matricule: l.eleves?.matricule || '',
          classe_nom: l.eleves?.classes?.nom || '',
          absencesNonJustifiees: compteurAbsences.get(l.eleve_id) || 0,
          moyenneGenerale: moyenneParEleve.get(l.eleve_id) ?? null,
          soldeAPayer: soldeParEleve.get(l.eleve_id) || 0,
        };
      });

      setEnfants(liste);
      setLoading(false);
    };
    charger();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bonjour, {prenom} 👋</h1>
        <p className="text-gray-600">Espace parent</p>
        <p className="text-sm text-gray-500">{etablissementNom}</p>
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      {enfants.length === 0 && !erreur && (
        <p className="text-gray-500 text-sm">Aucun enfant associé à votre compte.</p>
      )}

      <div className="space-y-4">
        {enfants.map((e) => (
          <div key={e.id} className="border rounded-xl p-4 space-y-3">
            <div>
              <div className="font-semibold text-lg">{e.nom} {e.prenom}</div>
              <div className="text-sm text-gray-500">{e.classe_nom} — {e.matricule}</div>
              {e.absencesNonJustifiees > 0 && (
                <div className="mt-1 inline-block text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                  {e.absencesNonJustifiees} absence(s) non justifiée(s)
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="border rounded-lg p-2.5 text-center">
                <p className="text-xs text-gray-500">Moyenne générale</p>
                <p className="text-lg font-semibold">
                  {e.moyenneGenerale !== null ? `${e.moyenneGenerale.toFixed(2)}/20` : '—'}
                </p>
              </div>
              <div className="border rounded-lg p-2.5 text-center">
                <p className="text-xs text-gray-500">Solde à payer</p>
                <p className={`text-lg font-semibold ${e.soldeAPayer > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {e.soldeAPayer.toLocaleString('fr-FR')} F
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Link
                href="/absences"
                className="text-center text-sm border rounded-lg py-2 hover:bg-gray-50"
              >
                📋<br />Absences
              </Link>
              <Link
                href="/emploi-du-temps"
                className="text-center text-sm border rounded-lg py-2 hover:bg-gray-50"
              >
                📅<br />Emploi du temps
              </Link>
              <Link
                href="/parent/bulletins"
                className="text-center text-sm border rounded-lg py-2 hover:bg-gray-50"
              >
                📄<br />Bulletins
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
        }
      
