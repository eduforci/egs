'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string; niveau: string | null };
type Appel = {
  classe_id: string;
  enseignant_id: string | null;
  nb_eleves: number | null;
  nb_absents: number;
  nb_retards: number;
  saisi_le: string;
};
type Absence = {
  id: string;
  eleve_id: string;
  classe_id: string;
  type: string;
  duree_minutes: number | null;
  justifie: boolean | null;
  motif: string | null;
};
type Nom = { nom: string; prenom: string };

function aujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

function decaler(jour: string, n: number) {
  const d = new Date(jour + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function libelleJour(jour: string) {
  return new Date(jour + 'T12:00:00Z').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Abidjan',
  });
}

export default function PointAppelsPage() {
  const [supabase] = useState(() => createClient());

  const [jour, setJour] = useState(aujourdhui());
  const [classes, setClasses] = useState<Classe[]>([]);
  const [appels, setAppels] = useState<Appel[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [eleves, setEleves] = useState<Map<string, Nom>>(new Map());
  const [profs, setProfs] = useState<Map<string, Nom>>(new Map());
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [seulementNonFaits, setSeulementNonFaits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');

      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', user.id)
        .single();
      if (!profil?.etablissement_id) throw new Error('Aucun établissement associé à votre compte.');
      const etabId = profil.etablissement_id as string;

      const { data: etab } = await supabase
        .from('etablissements')
        .select('annee_scolaire_active')
        .eq('id', etabId)
        .single();

      let listeClasses: Classe[] = [];
      if (etab?.annee_scolaire_active) {
        const { data } = await supabase
          .from('classes')
          .select('id, nom, niveau')
          .eq('etablissement_id', etabId)
          .eq('annee_scolaire', etab.annee_scolaire_active)
          .order('nom');
        listeClasses = (data as Classe[]) || [];
      }
      if (listeClasses.length === 0) {
        const { data } = await supabase
          .from('classes')
          .select('id, nom, niveau')
          .eq('etablissement_id', etabId)
          .order('nom');
        listeClasses = (data as Classe[]) || [];
      }
      setClasses(listeClasses);

      const [appelsRes, absencesRes] = await Promise.all([
        supabase
          .from('appels_journaliers')
          .select('classe_id, enseignant_id, nb_eleves, nb_absents, nb_retards, saisi_le')
          .eq('etablissement_id', etabId)
          .eq('date', jour),
        supabase
          .from('absences')
          .select('id, eleve_id, classe_id, type, duree_minutes, justifie, motif')
          .eq('etablissement_id', etabId)
          .eq('date', jour)
          .is('matiere_id', null),
      ]);
      if (appelsRes.error) throw new Error(appelsRes.error.message);
      if (absencesRes.error) throw new Error(absencesRes.error.message);

      const listeAppels = (appelsRes.data as Appel[]) || [];
      const listeAbsences = (absencesRes.data as Absence[]) || [];
      setAppels(listeAppels);
      setAbsences(listeAbsences);

      const idsEleves = Array.from(new Set(listeAbsences.map((a) => a.eleve_id)));
      const idsProfs = Array.from(
        new Set(listeAppels.map((a) => a.enseignant_id).filter(Boolean) as string[])
      );
      const tousIds = Array.from(new Set([...idsEleves, ...idsProfs]));

      const mapNoms = new Map<string, Nom>();
      if (tousIds.length > 0) {
        const { data: noms } = await supabase
          .from('profiles')
          .select('id, nom, prenom')
          .in('id', tousIds);
        (noms || []).forEach((p: any) => mapNoms.set(p.id, { nom: p.nom, prenom: p.prenom }));
      }
      setEleves(new Map(idsEleves.map((id) => [id, mapNoms.get(id) || { nom: 'Inconnu', prenom: '' }])));
      setProfs(new Map(idsProfs.map((id) => [id, mapNoms.get(id) || { nom: 'Inconnu', prenom: '' }])));
    } catch (e: any) {
      setErreur(e?.message || 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [supabase, jour]);

  useEffect(() => {
    charger();
  }, [charger]);

  const appelParClasse = useMemo(() => new Map(appels.map((a) => [a.classe_id, a])), [appels]);
  const absencesParClasse = useMemo(() => {
    const m = new Map<string, Absence[]>();
    absences.forEach((a) => {
      const l = m.get(a.classe_id) || [];
      l.push(a);
      m.set(a.classe_id, l);
    });
    return m;
  }, [absences]);

  const nbFaits = classes.filter((c) => appelParClasse.has(c.id)).length;
  const nbAbsents = absences.filter((a) => a.type === 'absence').length;
  const nbRetards = absences.filter((a) => a.type === 'retard').length;
  const nbNonJustifiees = absences.filter((a) => a.type === 'absence' && !a.justifie).length;

  const classesAffichees = classes.filter((c) => !seulementNonFaits || !appelParClasse.has(c.id));

  function basculerOuverte(id: string) {
    setOuvertes((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function basculerJustifie(a: Absence) {
    setMessage(null);
    setErreur(null);
    const nouvelle = !a.justifie;
    const { data, error } = await supabase
      .from('absences')
      .update({ justifie: nouvelle })
      .eq('id', a.id)
      .select('id');
    if (error || !data || data.length === 0) {
      setErreur(
        error?.message ||
          "Modification refusée : vérifiez que le script SQL « point des appels » a bien été exécuté."
      );
      return;
    }
    setAbsences((prev) => prev.map((x) => (x.id === a.id ? { ...x, justifie: nouvelle } : x)));
    setMessage(nouvelle ? 'Absence marquée comme justifiée.' : 'Justification retirée.');
  }

  const estAujourdhui = jour === aujourdhui();

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Point des appels</h1>
      <p className="text-sm text-gray-500 mb-4">
        Suivi des appels faits par les enseignants, classe par classe.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setJour(decaler(jour, -1))}
          className="border rounded-lg px-3 py-2 text-sm"
          aria-label="Jour précédent"
        >
          ◀
        </button>
        <input
          type="date"
          value={jour}
          max={aujourdhui()}
          onChange={(e) => e.target.value && setJour(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={estAujourdhui}
          onClick={() => setJour(decaler(jour, 1))}
          className="border rounded-lg px-3 py-2 text-sm disabled:opacity-30"
          aria-label="Jour suivant"
        >
          ▶
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4 capitalize">{libelleJour(jour)}</p>

      {erreur && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {erreur}
        </div>
      )}
      {message && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">
                {nbFaits}/{classes.length}
              </div>
              <div className="text-xs text-gray-500">Appels faits</div>
            </div>
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{classes.length - nbFaits}</div>
              <div className="text-xs text-gray-500">Appels non faits</div>
            </div>
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">
                {nbAbsents} <span className="text-sm font-normal text-gray-500">/ {nbRetards} retards</span>
              </div>
              <div className="text-xs text-gray-500">Absents</div>
            </div>
            <div className="border rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{nbNonJustifiees}</div>
              <div className="text-xs text-gray-500">Absences non justifiées</div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={seulementNonFaits}
              onChange={(e) => setSeulementNonFaits(e.target.checked)}
              className="h-4 w-4"
            />
            Afficher seulement les appels non faits
          </label>

          {classesAffichees.length === 0 && (
            <p className="text-sm text-gray-500">
              {classes.length === 0
                ? 'Aucune classe trouvée.'
                : 'Tous les appels de ce jour ont été faits.'}
            </p>
          )}

          <div className="space-y-2">
            {classesAffichees.map((c) => {
              const appel = appelParClasse.get(c.id);
              const liste = absencesParClasse.get(c.id) || [];
              const ouverte = ouvertes.has(c.id);
              const enseignant = appel?.enseignant_id ? profs.get(appel.enseignant_id) : undefined;
              return (
                <div key={c.id} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => appel && liste.length > 0 && basculerOuverte(c.id)}
                    className="w-full text-left p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{c.nom}</div>
                      {appel ? (
                        <div className="text-xs text-gray-500 mt-0.5">
                          Fait à {heure(appel.saisi_le)}
                          {enseignant ? ` par ${enseignant.prenom} ${enseignant.nom}` : ''}
                          {' · '}
                          {appel.nb_absents} absent(s), {appel.nb_retards} retard(s)
                        </div>
                      ) : (
                        <div className="text-xs text-red-600 mt-0.5">Appel non fait</div>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                        appel ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {appel ? 'Fait' : 'Non fait'}
                    </span>
                  </button>

                  {appel && liste.length > 0 && ouverte && (
                    <div className="border-t bg-gray-50 divide-y">
                      {liste.map((a) => {
                        const e = eleves.get(a.eleve_id);
                        return (
                          <div key={a.id} className="p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm">
                                {e ? `${e.nom} ${e.prenom}` : 'Élève'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {a.type === 'retard'
                                  ? `Retard${a.duree_minutes ? ` de ${a.duree_minutes} min` : ''}`
                                  : 'Absent'}
                                {a.motif ? ` · ${a.motif}` : ''}
                              </div>
                            </div>
                            <label className="flex items-center gap-1.5 text-xs shrink-0">
                              <input
                                type="checkbox"
                                checked={!!a.justifie}
                                onChange={() => basculerJustifie(a)}
                                className="h-4 w-4"
                              />
                              Justifiée
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {appel && liste.length > 0 && !ouverte && (
                    <div className="px-3 pb-2 text-xs text-blue-600">Touchez pour voir les élèves concernés</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
