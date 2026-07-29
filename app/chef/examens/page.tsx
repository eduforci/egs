'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Examen = {
  id: string;
  nom: string;
  categorie: string;
  type: string | null;
  niveau: string | null;
  serie: string | null;
  annee_scolaire: string;
  statut: string;
  date_debut: string | null;
};

const CATEGORIE_LABEL: Record<string, string> = {
  interne: 'Interne',
  regional: 'Régional',
  national: 'National',
};

const STATUT_LABEL: Record<string, string> = {
  preparation: 'En préparation',
  en_cours: 'En cours',
  termine: 'Terminé',
  archive: 'Archivé',
};

export default function ExamensDashboardPage() {
  const router = useRouter();
  const [examens, setExamens] = useState<Examen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [recherche, setRecherche] = useState('');
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');

  const supabase = createClient();

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', user.id)
        .single();

      if (profileError) throw new Error(`Erreur profil : ${profileError.message}`);

      const { data, error: examensError } = await supabase
        .from('examens')
        .select('id, nom, categorie, type, niveau, serie, annee_scolaire, statut, date_debut')
        .eq('etablissement_id', profile.etablissement_id)
        .order('created_at', { ascending: false });

      if (examensError) throw new Error(`Erreur examens : ${examensError.message}`);
      setExamens(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function archiverExamen(id: string) {
    setSucces(null);
    const { error: updateError } = await supabase
      .from('examens')
      .update({ statut: 'archive' })
      .eq('id', id);

    if (updateError) {
      setError(`Erreur archivage : ${updateError.message}`);
      return;
    }
    setSucces('Examen archivé.');
    charger();
  }

  async function supprimerExamen(id: string, nom: string) {
    const confirmation = window.confirm(
      `Supprimer définitivement "${nom}" ? Toutes les notes et données liées seront perdues. Cette action est irréversible.`
    );
    if (!confirmation) return;

    const { error: deleteError } = await supabase.from('examens').delete().eq('id', id);

    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    setSucces('Examen supprimé.');
    charger();
  }

  const examensFiltres = examens.filter((ex) => {
    const matchRecherche = ex.nom.toLowerCase().includes(recherche.toLowerCase());
    const matchCategorie = !filtreCategorie || ex.categorie === filtreCategorie;
    const matchStatut = !filtreStatut || ex.statut === filtreStatut;
    return matchRecherche && matchCategorie && matchStatut;
  });

  const compteurs = {
    total: examens.length,
    internes: examens.filter((e) => e.categorie === 'interne').length,
    regionaux: examens.filter((e) => e.categorie === 'regional').length,
    nationaux: examens.filter((e) => e.categorie === 'national').length,
    preparation: examens.filter((e) => e.statut === 'preparation').length,
    termines: examens.filter((e) => e.statut === 'termine').length,
  };

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-xl font-bold mb-1">Examens</h1>
          <p className="text-sm text-gray-500">Tableau de bord des examens de l'établissement</p>
        </div>
        <Link
          href="/chef/examens/nouveau"
          className="bg-black text-white text-sm px-4 py-2 rounded-md whitespace-nowrap"
        >
          + Créer un examen
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {error}
        </div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">
          {succes}
        </div>
      )}

      {/* Compteurs */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
        {[
          { label: 'Total', valeur: compteurs.total },
          { label: 'Internes', valeur: compteurs.internes },
          { label: 'Régionaux', valeur: compteurs.regionaux },
          { label: 'Nationaux', valeur: compteurs.nationaux },
          { label: 'En préparation', valeur: compteurs.preparation },
          { label: 'Terminés', valeur: compteurs.termines },
        ].map((c) => (
          <div key={c.label} className="border rounded-lg p-2 text-center">
            <p className="text-lg font-bold">{c.valeur}</p>
            <p className="text-[10px] text-gray-500 leading-tight">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Recherche et filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un examen..."
          className="flex-1 min-w-[140px] border rounded-md px-3 py-2 text-sm"
        />
        <select
          value={filtreCategorie}
          onChange={(e) => setFiltreCategorie(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm"
        >
          <option value="">Toutes catégories</option>
          <option value="interne">Interne</option>
          <option value="regional">Régional</option>
          <option value="national">National</option>
        </select>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="border rounded-md px-2 py-2 text-sm"
        >
          <option value="">Tous statuts</option>
          <option value="preparation">En préparation</option>
          <option value="en_cours">En cours</option>
          <option value="termine">Terminé</option>
          <option value="archive">Archivé</option>
        </select>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {examensFiltres.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">Aucun examen trouvé.</p>
        )}
        {examensFiltres.map((ex) => (
          <div key={ex.id} className="border rounded-lg p-3">
            <div className="flex justify-between items-start gap-2">
              <Link href={`/chef/examens/${ex.id}`} className="flex-1">
                <p className="font-medium">{ex.nom}</p>
                <p className="text-xs text-gray-500">
                  {CATEGORIE_LABEL[ex.categorie] ?? ex.categorie}
                  {ex.niveau ? ` · ${ex.niveau}` : ''}
                  {ex.serie ? ` ${ex.serie}` : ''}
                  {' · '}{ex.annee_scolaire}
                </p>
              </Link>
              <span className="text-xs bg-gray-100 rounded-full px-2 py-1 whitespace-nowrap">
                {STATUT_LABEL[ex.statut] ?? ex.statut}
              </span>
            </div>
            <div className="flex gap-3 mt-2 text-xs">
              <Link href={`/chef/examens/${ex.id}`} className="text-blue-600">Voir</Link>
              <Link href={`/chef/examens/${ex.id}/modifier`} className="text-blue-600">Modifier</Link>
              {ex.statut !== 'archive' && (
                <button onClick={() => archiverExamen(ex.id)} className="text-amber-600">Archiver</button>
              )}
              <button onClick={() => supprimerExamen(ex.id, ex.nom)} className="text-red-600">Supprimer</button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
               }
