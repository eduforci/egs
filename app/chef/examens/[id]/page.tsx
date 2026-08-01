'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const CATEGORIE_LABEL: Record<string, string> = {
  interne: 'Interne', regional: 'Régional', national: 'National',
};
const TYPE_LABEL: Record<string, string> = {
  interne: 'Interne', examen_blanc_local: 'Examen blanc local',
  examen_de_passage: 'Examen de passage', concours: 'Concours', autre: 'Autre',
  cepe_blanc_regional: 'CEPE blanc régional', bepc_blanc_regional: 'BEPC blanc régional',
  bac_blanc_regional: 'BAC blanc régional', cepe: 'CEPE', bepc: 'BEPC', bac: 'BAC',
};
const STATUT_LABEL: Record<string, string> = {
  preparation: 'En préparation', en_cours: 'En cours', termine: 'Terminé', archive: 'Archivé',
};

export default function ExamenDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const examenId = params?.id as string;
  const supabase = createClient();

  const [examen, setExamen] = useState<any>(null);
  const [centre, setCentre] = useState<any>(null);
  const [classes, setClasses] = useState<{ id: string; nom: string }[]>([]);
  const [nbCandidats, setNbCandidats] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: examenData, error: examenError } = await supabase
        .from('examens')
        .select('*')
        .eq('id', examenId)
        .single();

      if (examenError) throw new Error(`Erreur examen : ${examenError.message}`);
      setExamen(examenData);

      if (examenData.categorie !== 'interne') {
        const { data: centreData } = await supabase
          .from('examens_centre')
          .select('*')
          .eq('examen_id', examenId)
          .maybeSingle();
        setCentre(centreData);
      }

      const { data: classesData, error: classesError } = await supabase
        .from('examens_classes')
        .select('classe_id, classes(id, nom)')
        .eq('examen_id', examenId);

      if (classesError) throw new Error(`Erreur classes : ${classesError.message}`);

      type Row = { classe_id: string; classes: { id: string; nom: string } | { id: string; nom: string }[] | null };
      const listeClasses = ((classesData ?? []) as unknown as Row[]).map((r) => {
        const c = Array.isArray(r.classes) ? r.classes[0] : r.classes;
        return { id: c?.id ?? r.classe_id, nom: c?.nom ?? 'Inconnue' };
      });
      setClasses(listeClasses);

      const classeIds = listeClasses.map((c) => c.id);
      const { count } = await supabase
        .from('eleves')
        .select('id', { count: 'exact', head: true })
        .in('classe_id', classeIds.length > 0 ? classeIds : ['00000000-0000-0000-0000-000000000000']);
      setNbCandidats(count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [examenId, supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function archiver() {
    const { error: updateError } = await supabase
      .from('examens')
      .update({ statut: 'archive' })
      .eq('id', examenId);
    if (updateError) {
      setError(`Erreur archivage : ${updateError.message}`);
      return;
    }
    setSucces('Examen archivé.');
    charger();
  }

  async function supprimer() {
    const confirmation = window.confirm(
      `Supprimer définitivement "${examen.nom}" ? Cette action est irréversible.`
    );
    if (!confirmation) return;

    const { error: deleteError } = await supabase.from('examens').delete().eq('id', examenId);
    if (deleteError) {
      setError(`Erreur suppression : ${deleteError.message}`);
      return;
    }
    router.push('/chef/examens');
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;
  if (!examen) return <p className="p-6 text-sm text-red-600">Examen introuvable.</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-12">
      <div className="flex justify-between items-start mb-1">
        <h1 className="text-xl font-bold">{examen.nom}</h1>
        <span className="text-xs bg-gray-100 rounded-full px-2 py-1 whitespace-nowrap">
          {STATUT_LABEL[examen.statut] ?? examen.statut}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {CATEGORIE_LABEL[examen.categorie]} · {TYPE_LABEL[examen.type] ?? examen.type} · {examen.annee_scolaire}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{error}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* Actions rapides */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link href={`/chef/examens/${examenId}/modifier`} className="border rounded-md px-3 py-1.5 text-sm">
          Modifier
        </Link>
        {examen.statut !== 'archive' && (
          <button onClick={archiver} className="border rounded-md px-3 py-1.5 text-sm text-amber-600">
            Archiver
          </button>
        )}
        <button onClick={supprimer} className="border rounded-md px-3 py-1.5 text-sm text-red-600">
          Supprimer
        </button>
      </div>

      {/* Épreuves, candidats et notes */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <Link
          href={`/chef/examens/${examenId}/epreuves`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Épreuves
        </Link>
        <Link
          href={`/chef/examens/${examenId}/candidats`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Candidats
        </Link>
        <Link
          href={`/chef/examens/${examenId}/notes`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Notes
        </Link>
        <Link
          href={`/chef/examens/${examenId}/resultats`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Résultats
        </Link>
        <Link
          href={`/chef/examens/${examenId}/documents`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Documents
        </Link>
        <Link
          href={`/chef/examens/${examenId}/parametres`}
          className="border rounded-lg p-3 text-center text-sm font-medium hover:bg-gray-50"
        >
          Paramètres
        </Link>
      </div>

      {/* Informations générales */}
      <div className="border rounded-lg p-4 mb-4 text-sm space-y-1">
        <p className="font-semibold mb-2">Informations générales</p>
        <p><span className="text-gray-500">Organisateur :</span> {examen.organisateur ?? '-'}</p>
        <p><span className="text-gray-500">Session :</span> {examen.session ?? '-'}</p>
        <p><span className="text-gray-500">Dates :</span> {examen.date_debut ?? '-'} → {examen.date_fin ?? '-'}</p>
        {examen.description && <p><span className="text-gray-500">Description :</span> {examen.description}</p>}
      </div>

      {/* Public concerné */}
      <div className="border rounded-lg p-4 mb-4 text-sm">
        <p className="font-semibold mb-2">Public concerné</p>
        <p className="mb-2">
          <span className="text-gray-500">Niveau :</span> {examen.niveau}
          {examen.serie && ` — Série ${examen.serie}`}
          {' · '}{nbCandidats} candidat(s)
        </p>
        {classes.length > 0 ? (
          <ul className="list-disc list-inside text-gray-600">
            {classes.map((c) => <li key={c.id}>{c.nom}</li>)}
          </ul>
        ) : (
          <p className="text-gray-400">Aucune classe rattachée.</p>
        )}
      </div>

      {/* Centre d'examen */}
      {examen.categorie !== 'interne' && (
        <div className="border rounded-lg p-4 text-sm space-y-1">
          <p className="font-semibold mb-2">Centre d'examen</p>
          {centre ? (
            <>
              <p><span className="text-gray-500">Nom :</span> {centre.nom_centre ?? '-'}</p>
              <p><span className="text-gray-500">Code :</span> {centre.code_centre ?? '-'}</p>
              <p><span className="text-gray-500">Ville :</span> {centre.ville ?? '-'}</p>
              <p><span className="text-gray-500">DRENA :</span> {centre.drena ?? '-'}</p>
              <p><span className="text-gray-500">Adresse :</span> {centre.adresse ?? '-'}</p>
              <p><span className="text-gray-500">Président du jury :</span> {centre.president_jury ?? '-'}</p>
              <p><span className="text-gray-500">Secrétaire :</span> {centre.secretaire ?? '-'}</p>
              {centre.observations && <p><span className="text-gray-500">Observations :</span> {centre.observations}</p>}
            </>
          ) : (
            <p className="text-gray-400">Aucune information de centre renseignée.</p>
          )}
        </div>
      )}
    </main>
  );
        }
