'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const TYPES_PAR_CATEGORIE: Record<string, { value: string; label: string }[]> = {
  interne: [
    { value: 'interne', label: 'Interne' },
    { value: 'examen_blanc_local', label: 'Examen blanc local' },
    { value: 'examen_de_passage', label: 'Examen de passage' },
    { value: 'concours', label: 'Concours' },
    { value: 'autre', label: 'Autre' },
  ],
  regional: [
    { value: 'cepe_blanc_regional', label: 'CEPE blanc régional' },
    { value: 'bepc_blanc_regional', label: 'BEPC blanc régional' },
    { value: 'bac_blanc_regional', label: 'BAC blanc régional' },
  ],
  national: [
    { value: 'cepe', label: 'CEPE' },
    { value: 'bepc', label: 'BEPC' },
    { value: 'bac', label: 'BAC' },
  ],
};

// Associe chaque type national/régional à son niveau imposé
const NIVEAU_IMPOSE: Record<string, string> = {
  cepe: 'CM2', cepe_blanc_regional: 'CM2',
  bepc: '3ème', bepc_blanc_regional: '3ème',
  bac: 'Terminale', bac_blanc_regional: 'Terminale',
};

const SERIES_BAC = ['A1', 'A2', 'C', 'D'];

const CYCLES = [
  { value: 'maternelle', label: 'Maternelle', niveaux: ['Petite Section', 'Moyenne Section', 'Grande Section'] },
  { value: 'primaire', label: 'Primaire', niveaux: ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'] },
  { value: 'college', label: 'Collège', niveaux: ['6ème', '5ème', '4ème', '3ème'] },
  { value: 'lycee', label: 'Lycée', niveaux: ['Seconde', 'Première', 'Terminale'] },
];

export default function ExamenCreatePage() {
  const router = useRouter();
  const supabase = createClient();

  const [etablissementId, setEtablissementId] = useState<string | null>(null);
  const [etablissementNom, setEtablissementNom] = useState('');
  const [anneeActive, setAnneeActive] = useState('');
  const [seriesDisponibles, setSeriesDisponibles] = useState<string[]>([]);
  const [classesCorrespondantes, setClassesCorrespondantes] = useState<{ id: string; nom: string }[]>([]);

  const [nom, setNom] = useState('');
  const [categorie, setCategorie] = useState<'interne' | 'regional' | 'national'>('interne');
  const [type, setType] = useState('interne');
  const [session, setSession] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [description, setDescription] = useState('');
  const [organisateur, setOrganisateur] = useState('');
  const [cycle, setCycle] = useState('college');
  const [niveau, setNiveau] = useState('');
  const [serie, setSerie] = useState('');

  // Centre d'examen (régional/national uniquement)
  const [nomCentre, setNomCentre] = useState('');
  const [codeCentre, setCodeCentre] = useState('');
  const [villeCentre, setVilleCentre] = useState('');
  const [adresseCentre, setAdresseCentre] = useState('');
  const [drena, setDrena] = useState('');
  const [presidentJury, setPresidentJury] = useState('');
  const [secretaireJury, setSecretaireJury] = useState('');
  const [observationsCentre, setObservationsCentre] = useState('');

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const niveauImpose = NIVEAU_IMPOSE[type];
  const niveauFinal = niveauImpose ?? niveau;
  const estBac = niveauFinal === 'Terminale';

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
      setEtablissementId(profile.etablissement_id);

      const { data: etab, error: etabError } = await supabase
        .from('etablissements')
        .select('nom, annee_scolaire_active')
        .eq('id', profile.etablissement_id)
        .single();

      if (etabError) throw new Error(`Erreur établissement : ${etabError.message}`);
      setEtablissementNom(etab.nom);
      setAnneeActive(etab.annee_scolaire_active);
      setOrganisateur(etab.nom); // organisateur par défaut pour "interne"
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Organisateur automatique selon la catégorie
  useEffect(() => {
    if (categorie === 'interne') {
      setOrganisateur(etablissementNom);
    } else if (categorie === 'regional') {
      setOrganisateur((prev) => (prev === etablissementNom || prev === 'DECO' ? 'DRENA' : prev));
    } else if (categorie === 'national') {
      setOrganisateur((prev) => (prev === etablissementNom || prev === 'DRENA' ? 'DECO' : prev));
    }
  }, [categorie, etablissementNom]);

  // Type par défaut à chaque changement de catégorie
  useEffect(() => {
    setType(TYPES_PAR_CATEGORIE[categorie][0].value);
  }, [categorie]);

  // Charger les séries disponibles quand le niveau final est Terminale
  useEffect(() => {
    async function chargerSeries() {
      if (!etablissementId || niveauFinal !== 'Terminale') {
        setSeriesDisponibles([]);
        return;
      }
      const { data } = await supabase
        .from('classes')
        .select('serie')
        .eq('etablissement_id', etablissementId)
        .eq('niveau', 'Terminale')
        .not('serie', 'is', null);

      const uniques = Array.from(new Set((data ?? []).map((c) => c.serie).filter(Boolean))) as string[];
      setSeriesDisponibles(uniques.length > 0 ? uniques : SERIES_BAC);
    }
    chargerSeries();
  }, [etablissementId, niveauFinal, supabase]);

  // Aperçu des classes correspondant au niveau/série choisis
  useEffect(() => {
    async function chargerClasses() {
      if (!etablissementId || !niveauFinal) {
        setClassesCorrespondantes([]);
        return;
      }
      let query = supabase
        .from('classes')
        .select('id, nom')
        .eq('etablissement_id', etablissementId)
        .eq('niveau', niveauFinal);

      if (estBac && serie) {
        query = query.eq('serie', serie);
      }

      const { data } = await query;
      setClassesCorrespondantes(data ?? []);
    }
    chargerClasses();
  }, [etablissementId, niveauFinal, estBac, serie, supabase]);

  async function creerExamen() {
    if (!nom.trim() || !etablissementId || !niveauFinal) {
      setError('Nom et niveau sont obligatoires.');
      return;
    }
    if (estBac && seriesDisponibles.length > 0 && !serie) {
      setError('Choisis une série pour un examen de Terminale.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const { data: nouvelExamen, error: insertError } = await supabase
        .from('examens')
        .insert({
          etablissement_id: etablissementId,
          nom: nom.trim(),
          categorie,
          type,
          session: session.trim() || null,
          annee_scolaire: anneeActive,
          date_debut: dateDebut || null,
          date_fin: dateFin || null,
          description: description.trim() || null,
          organisateur: organisateur.trim() || null,
          cycle,
          niveau: niveauFinal,
          serie: estBac ? serie || null : null,
          statut: 'preparation',
        })
        .select('id')
        .single();

      if (insertError || !nouvelExamen) {
        throw new Error(insertError?.message || 'Erreur lors de la création.');
      }

      // Centre d'examen si régional/national
      if (categorie !== 'interne') {
        await supabase.from('examens_centre').insert({
          examen_id: nouvelExamen.id,
          nom_centre: nomCentre.trim() || null,
          code_centre: codeCentre.trim() || null,
          ville: villeCentre.trim() || null,
          adresse: adresseCentre.trim() || null,
          drena: drena.trim() || null,
          president_jury: presidentJury.trim() || null,
          secretaire: secretaireJury.trim() || null,
          observations: observationsCentre.trim() || null,
        });
      }

      // Peupler automatiquement les classes participantes (public concerné)
      if (classesCorrespondantes.length > 0) {
        await supabase.from('examens_classes').insert(
          classesCorrespondantes.map((c) => ({ examen_id: nouvelExamen.id, classe_id: c.id }))
        );
      }

      router.push(`/chef/examens/${nouvelExamen.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setCreating(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold mb-1">Créer un examen</h1>
      <p className="text-sm text-gray-500 mb-4">Année scolaire {anneeActive}</p>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Informations générales */}
        <div className="border rounded-lg p-4 space-y-3">
          <p className="font-semibold text-sm">Informations générales</p>

          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom de l'examen"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          <div>
            <label className="block text-xs text-gray-600 mb-1">Catégorie</label>
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value as any)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="interne">Interne</option>
              <option value="regional">Régional</option>
              <option value="national">National</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {TYPES_PAR_CATEGORIE[categorie].map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Organisateur</label>
            <input
              type="text"
              value={organisateur}
              onChange={(e) => setOrganisateur(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <input
            type="text"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            placeholder="Session (ex: Session unique, 1ère session)"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date de début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date de fin</label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optionnel)"
            rows={2}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* Public concerné */}
        <div className="border rounded-lg p-4 space-y-3">
          <p className="font-semibold text-sm">Public concerné</p>

          {niveauImpose ? (
            <p className="text-sm bg-gray-50 rounded-md px-3 py-2">
              Niveau imposé par le type d'examen : <strong>{niveauImpose}</strong>
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Cycle</label>
                <select
                  value={cycle}
                  onChange={(e) => { setCycle(e.target.value); setNiveau(''); }}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  {CYCLES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Niveau</label>
                <select
                  value={niveau}
                  onChange={(e) => setNiveau(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Choisir un niveau</option>
                  {CYCLES.find((c) => c.value === cycle)?.niveaux.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {estBac && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">Série</label>
              <select
                value={serie}
                onChange={(e) => setSerie(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Choisir une série</option>
                {seriesDisponibles.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {seriesDisponibles.length === SERIES_BAC.length && (
                <p className="text-xs text-amber-600 mt-1">
                  Aucune série n'est encore renseignée sur tes classes de Terminale — la liste ci-dessus
                  est générique. Renseigne le champ "série" sur tes classes pour un filtrage précis.
                </p>
              )}
            </div>
          )}

          {niveauFinal && (
            <div className={`text-xs rounded-md p-3 ${classesCorrespondantes.length === 0 ? 'bg-red-50 border border-red-300 text-red-700' : 'text-gray-500'}`}>
              <p className="font-medium mb-1">
                {classesCorrespondantes.length} classe(s) concernée(s) :
              </p>
              {classesCorrespondantes.length > 0 ? (
                <ul className="list-disc list-inside">
                  {classesCorrespondantes.map((c) => <li key={c.id}>{c.nom}</li>)}
                </ul>
              ) : (
                <p className="font-medium">
                  ⚠️ Aucune classe "{niveauFinal}"{estBac && serie ? ` série ${serie}` : ''} n'existe dans cet
                  établissement. Crée d'abord cette classe, ou choisis un autre niveau — sinon aucun candidat
                  ne pourra être ajouté à cet examen.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Centre d'examen (régional/national uniquement) */}
        {categorie !== 'interne' && (
          <div className="border rounded-lg p-4 space-y-3">
            <p className="font-semibold text-sm">Centre d'examen</p>
            <input type="text" value={nomCentre} onChange={(e) => setNomCentre(e.target.value)} placeholder="Nom du centre" className="w-full border rounded-md px-3 py-2 text-sm" />
            <input type="text" value={codeCentre} onChange={(e) => setCodeCentre(e.target.value)} placeholder="Code du centre" className="w-full border rounded-md px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={villeCentre} onChange={(e) => setVilleCentre(e.target.value)} placeholder="Ville" className="w-full border rounded-md px-3 py-2 text-sm" />
              <input type="text" value={drena} onChange={(e) => setDrena(e.target.value)} placeholder="DRENA" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <input type="text" value={adresseCentre} onChange={(e) => setAdresseCentre(e.target.value)} placeholder="Adresse" className="w-full border rounded-md px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={presidentJury} onChange={(e) => setPresidentJury(e.target.value)} placeholder="Président du jury" className="w-full border rounded-md px-3 py-2 text-sm" />
              <input type="text" value={secretaireJury} onChange={(e) => setSecretaireJury(e.target.value)} placeholder="Secrétaire" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <textarea value={observationsCentre} onChange={(e) => setObservationsCentre(e.target.value)} placeholder="Observations" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        )}

        <button
          onClick={creerExamen}
          disabled={creating || !nom.trim() || !niveauFinal || classesCorrespondantes.length === 0}
          className="w-full bg-black text-white rounded-md py-3 text-sm font-medium disabled:opacity-50"
        >
          {creating
            ? 'Création...'
            : classesCorrespondantes.length === 0 && niveauFinal
              ? 'Aucune classe correspondante — impossible de créer'
              : "Créer l'examen"}
        </button>
      </div>
    </main>
  );
}
