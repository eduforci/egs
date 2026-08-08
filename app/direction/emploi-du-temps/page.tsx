'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string; cycle: string | null; annee_scolaire: string | null };
type Matiere = { id: string; nom: string };
type Enseignant = { id: string; nom: string; prenom: string };
type Periode = { id: string; ordre: number; heure_debut: string; heure_fin: string; est_pause: boolean; libelle: string | null };
type Creneau = {
  id: string;
  jour: string;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  matiere_id: string;
  enseignant_id: string;
  periode_id: string | null;
  matieres?: { nom: string };
  profiles?: { nom: string; prenom: string };
};
type Etablissement = {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  code_etablissement: string | null;
  dren: string | null;
  type_etablissement: string | null;
};
type ProfPrincipal = { nom: string; prenom: string; specialite: string | null };

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_LABEL: Record<string, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
  jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi',
};
const JOURS_LABEL_MAJ: Record<string, string> = {
  lundi: 'LUNDI', mardi: 'MARDI', mercredi: 'MERCREDI',
  jeudi: 'JEUDI', vendredi: 'VENDREDI', samedi: 'SAMEDI',
};

const FORM_VIDE = {
  jour: 'lundi',
  periode_id: '',
  matiere_id: '',
  enseignant_id: '',
  salle: '',
};

function EmploiDuTempsContenu() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState(searchParams.get('classe') || '');
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [profPrincipal, setProfPrincipal] = useState<ProfPrincipal | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(FORM_VIDE);

  const classeSelectionnee = classes.find((c) => c.id === classeId);

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData.user.id)
        .single();

      if (!profil?.etablissement_id) return;

      const { data: etab } = await supabase
        .from('etablissements')
        .select('nom, adresse, telephone, code_etablissement, dren, type_etablissement')
        .eq('id', profil.etablissement_id)
        .single();
      setEtablissement(etab || null);

      const { data, error } = await supabase
        .from('classes')
        .select('id, nom, cycle, annee_scolaire')
        .eq('etablissement_id', profil.etablissement_id)
        .order('nom');

      if (error) {
        setMessage({ type: 'error', text: 'Erreur chargement classes: ' + error.message });
        return;
      }
      setClasses(data || []);
    };
    load();
  }, [supabase]);

  useEffect(() => {
    const loadRelated = async () => {
      if (!classeId || !classeSelectionnee) return;

      const { data: userData } = await supabase.auth.getUser();
      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData?.user?.id)
        .single();

      const { data: cm } = await supabase
        .from('classes_matieres')
        .select('matiere_id, matieres(id, nom)')
        .eq('classe_id', classeId);

      setMatieres((cm || []).map((row: any) => row.matieres).filter(Boolean));

      const { data: aff } = await supabase
        .from('affectations_enseignant')
        .select('enseignant_id')
        .eq('classe_id', classeId);

      const idsEns = (aff || []).map((a) => a.enseignant_id);
      if (idsEns.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, nom, prenom')
          .in('id', idsEns);
        setEnseignants(profs || []);
      } else {
        setEnseignants([]);
      }

      // Professeur principal de la classe (via complement_service)
      const { data: ppData } = await supabase
        .from('complement_service')
        .select('enseignant_id')
        .eq('classe_id', classeId)
        .eq('type', 'PP')
        .maybeSingle();

      if (ppData?.enseignant_id) {
        const { data: ppProfil } = await supabase
          .from('profiles')
          .select('nom, prenom')
          .eq('id', ppData.enseignant_id)
          .single();
        const { data: ppEns } = await supabase
          .from('enseignants')
          .select('specialite')
          .eq('id', ppData.enseignant_id)
          .single();
        setProfPrincipal(ppProfil ? { nom: ppProfil.nom, prenom: ppProfil.prenom, specialite: ppEns?.specialite || null } : null);
      } else {
        setProfPrincipal(null);
      }

      if (classeSelectionnee.cycle && profil?.etablissement_id) {
        const { data: periodesData, error: periodesError } = await supabase
          .from('creneaux_horaires_types')
          .select('id, ordre, heure_debut, heure_fin, est_pause, libelle')
          .eq('etablissement_id', profil.etablissement_id)
          .eq('cycle', classeSelectionnee.cycle)
          .order('ordre');

        if (periodesError) {
          setMessage({ type: 'error', text: 'Erreur chargement grille horaire: ' + periodesError.message });
        } else {
          setPeriodes(periodesData || []);
        }
      } else {
        setPeriodes([]);
      }
    };
    loadRelated();
  }, [classeId, classeSelectionnee, supabase]);

  const chargerCreneaux = useCallback(async () => {
    if (!classeId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('emploi_du_temps')
      .select('id, jour, heure_debut, heure_fin, salle, matiere_id, enseignant_id, periode_id, matieres(nom), profiles(nom, prenom)')
      .eq('classe_id', classeId)
      .order('heure_debut');

    if (error) {
      setMessage({ type: 'error', text: 'Erreur chargement emploi du temps: ' + error.message });
      setLoading(false);
      return;
    }
    setCreneaux((data as any) || []);
    setLoading(false);
  }, [classeId, supabase]);

  useEffect(() => {
    chargerCreneaux();
  }, [chargerCreneaux]);

  const ouvrirFormAjout = () => {
    setEditingId(null);
    setForm(FORM_VIDE);
    setShowForm(true);
    setMessage(null);
  };

  const ouvrirFormEdition = (c: Creneau) => {
    setEditingId(c.id);
    setForm({
      jour: c.jour,
      periode_id: c.periode_id || '',
      matiere_id: c.matiere_id,
      enseignant_id: c.enseignant_id,
      salle: c.salle || '',
    });
    setShowForm(true);
    setMessage(null);
  };

  const annulerForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(FORM_VIDE);
  };

  const validerForm = async () => {
    setSaving(true);
    setMessage(null);

    if (!form.matiere_id || !form.enseignant_id || !form.periode_id) {
      setMessage({ type: 'error', text: 'Sélectionnez une période, une matière et un enseignant.' });
      setSaving(false);
      return;
    }

    const periode = periodes.find((p) => p.id === form.periode_id);
    if (!periode) {
      setMessage({ type: 'error', text: 'Période introuvable.' });
      setSaving(false);
      return;
    }

    const { data: conflitEns } = await supabase.rpc('enseignant_en_conflit', {
      p_enseignant_id: form.enseignant_id,
      p_jour: form.jour,
      p_heure_debut: periode.heure_debut,
      p_heure_fin: periode.heure_fin,
      p_exclude_id: editingId,
    });

    if (conflitEns) {
      setMessage({ type: 'error', text: "Cet enseignant a déjà un cours sur ce créneau." });
      setSaving(false);
      return;
    }

    const { data: conflitClasse } = await supabase.rpc('classe_en_conflit', {
      p_classe_id: classeId,
      p_jour: form.jour,
      p_heure_debut: periode.heure_debut,
      p_heure_fin: periode.heure_fin,
      p_exclude_id: editingId,
    });

    if (conflitClasse) {
      setMessage({ type: 'error', text: 'La classe a déjà un cours sur ce créneau.' });
      setSaving(false);
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from('emploi_du_temps')
        .update({
          matiere_id: form.matiere_id,
          enseignant_id: form.enseignant_id,
          jour: form.jour,
          periode_id: form.periode_id,
          heure_debut: periode.heure_debut,
          heure_fin: periode.heure_fin,
          salle: form.salle || null,
        })
        .eq('id', editingId);

      if (error) {
        setMessage({ type: 'error', text: 'Erreur modification: ' + error.message });
        setSaving(false);
        return;
      }
      setMessage({ type: 'success', text: 'Créneau modifié.' });
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData?.user?.id)
        .single();

      const { error } = await supabase.from('emploi_du_temps').insert({
        etablissement_id: profil?.etablissement_id,
        classe_id: classeId,
        matiere_id: form.matiere_id,
        enseignant_id: form.enseignant_id,
        jour: form.jour,
        periode_id: form.periode_id,
        heure_debut: periode.heure_debut,
        heure_fin: periode.heure_fin,
        salle: form.salle || null,
      });

      if (error) {
        setMessage({ type: 'error', text: "Erreur ajout: " + error.message });
        setSaving(false);
        return;
      }
      setMessage({ type: 'success', text: 'Créneau ajouté.' });
    }

    setForm(FORM_VIDE);
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
    chargerCreneaux();
  };

  const supprimerCreneau = async (id: string) => {
    const { error } = await supabase.from('emploi_du_temps').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Erreur suppression: ' + error.message });
      return;
    }
    if (editingId === id) annulerForm();
    chargerCreneaux();
  };

  const trouverCreneau = (jour: string, heureDebut: string, heureFin: string) => {
    return creneaux.find(
      (c) => c.jour === jour && c.heure_debut.slice(0, 5) === heureDebut.slice(0, 5) && c.heure_fin.slice(0, 5) === heureFin.slice(0, 5)
    );
  };

  const joursAffiches = JOURS.slice(0, 5).concat(creneaux.some((c) => c.jour === 'samedi') ? ['samedi'] : []);

  const totalHeuresSemaine = creneaux.reduce((sum, c) => {
    const [h1, m1] = c.heure_debut.slice(0, 5).split(':').map(Number);
    const [h2, m2] = c.heure_fin.slice(0, 5).split(':').map(Number);
    return sum + ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
  }, 0);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          @page { size: landscape; margin: 10mm; }
        }
        table.edt-table th, table.edt-table td {
          border: 1px solid #999;
          padding: 4px;
          font-size: 10px;
          text-align: center;
        }
        table.edt-table th { background: #e5e5e5; font-weight: bold; }
        .pause-row td { background: #d5d5d5; font-weight: bold; }
      `}</style>

      <div className="no-print space-y-3">
        <h1 className="text-2xl font-bold">Emploi du temps</h1>

        <div>
          <label className="block text-sm font-medium mb-1">Classe</label>
          <select
            value={classeId}
            onChange={(e) => { setClasseId(e.target.value); annulerForm(); }}
            className="w-full border rounded-lg p-2"
          >
            <option value="">-- Sélectionner une classe --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        {classeId && !classeSelectionnee?.cycle && (
          <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-700 border border-orange-200">
            Cette classe n'a pas de cycle défini, impossible de charger la grille horaire.
          </div>
        )}

        {classeId && classeSelectionnee?.cycle && periodes.length === 0 && (
          <div className="p-3 rounded-lg text-sm bg-orange-50 text-orange-700 border border-orange-200">
            Aucune période définie pour le cycle "{classeSelectionnee.cycle}". Configurez d'abord la grille horaire.
          </div>
        )}

        {classeId && periodes.length > 0 && (
          <>
            {!showForm && (
              <div className="flex gap-2">
                <button
                  onClick={ouvrirFormAjout}
                  className="flex-1 bg-gray-800 text-white py-2.5 rounded-lg font-medium"
                >
                  + Ajouter un créneau
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium"
                >
                  🖨️ Imprimer
                </button>
              </div>
            )}

            {showForm && (
              <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm text-gray-700">
                    {editingId ? 'Modifier le créneau' : 'Nouveau créneau'}
                  </span>
                  <button onClick={annulerForm} className="text-sm text-gray-500">Annuler</button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Jour</label>
                  <select
                    value={form.jour}
                    onChange={(e) => setForm({ ...form, jour: e.target.value })}
                    className="w-full border rounded-lg p-2"
                  >
                    {JOURS.map((j) => (
                      <option key={j} value={j}>{JOURS_LABEL[j]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Période</label>
                  <select
                    value={form.periode_id}
                    onChange={(e) => setForm({ ...form, periode_id: e.target.value })}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="">-- Choisir un créneau horaire --</option>
                    {periodes.filter((p) => !p.est_pause).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.heure_debut.slice(0, 5)} - {p.heure_fin.slice(0, 5)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Matière</label>
                  <select
                    value={form.matiere_id}
                    onChange={(e) => setForm({ ...form, matiere_id: e.target.value })}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="">-- Choisir --</option>
                    {matieres.map((m) => (
                      <option key={m.id} value={m.id}>{m.nom}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Enseignant</label>
                  <select
                    value={form.enseignant_id}
                    onChange={(e) => setForm({ ...form, enseignant_id: e.target.value })}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="">-- Choisir --</option>
                    {enseignants.map((e) => (
                      <option key={e.id} value={e.id}>{e.nom} {e.prenom}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Salle (optionnel)</label>
                  <input
                    type="text"
                    value={form.salle}
                    onChange={(e) => setForm({ ...form, salle: e.target.value })}
                    className="w-full border rounded-lg p-2"
                    placeholder="Ex: SCL3, LABO PC, BIB/CDI"
                  />
                </div>

                <button
                  onClick={validerForm}
                  disabled={saving}
                  className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
                >
                  {saving ? 'Enregistrement...' : editingId ? 'Enregistrer les modifications' : 'Ajouter'}
                </button>
              </div>
            )}

            {loading && <p className="text-gray-500">Chargement...</p>}
          </>
        )}
      </div>

      {/* APERCU IMPRIMABLE - format officiel "Emploi du temps classe" */}
      {classeId && classeSelectionnee && periodes.length > 0 && etablissement && (
        <div className="space-y-3 border-t pt-4">
          <div className="text-center text-xs font-bold leading-tight">
            <div>MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE L'ALPHABÉTISATION</div>
            {etablissement.dren && <div>DRENA {etablissement.dren.toUpperCase()}</div>}
          </div>

          <div className="flex justify-between items-start text-sm border-b pb-2">
            <div>
              <div className="font-bold">{etablissement.nom}</div>
              {etablissement.telephone && <div className="text-xs">Tél : {etablissement.telephone}</div>}
              {etablissement.adresse && <div className="text-xs">{etablissement.adresse}</div>}
            </div>
            <div className="text-right text-xs">
              <div>Année Scolaire : {classeSelectionnee.annee_scolaire || '—'}</div>
              {etablissement.code_etablissement && <div>Code : {etablissement.code_etablissement}</div>}
              {etablissement.type_etablissement && <div>Statut : {etablissement.type_etablissement}</div>}
            </div>
          </div>

          <h2 className="text-center font-bold text-lg border py-1">
            EMPLOI DU TEMPS CLASSE : {classeSelectionnee.nom.toUpperCase()}
          </h2>

          <div className="text-sm">
            <strong>PROFESSEUR PRINCIPAL :</strong>{' '}
            {profPrincipal
              ? `${profPrincipal.nom} ${profPrincipal.prenom}${profPrincipal.specialite ? ` (Professeur de ${profPrincipal.specialite})` : ''}`
              : 'Non désigné'}
          </div>
          <div className="text-sm">
            <strong>NOMBRE HEURES DE COURS PAR SEMAINE =</strong> {totalHeuresSemaine}H
    </div>

          <div className="overflow-x-auto">
            <table className="edt-table w-full border-collapse">
              <thead>
                <tr>
                  <th>HORAIRES</th>
                  {joursAffiches.map((j) => (
                    <th key={j}>{JOURS_LABEL_MAJ[j]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodes.map((p) => {
                  if (p.est_pause) {
                    return (
                      <tr key={p.id} className="pause-row">
                        <td>{p.heure_debut.slice(0, 5)} - {p.heure_fin.slice(0, 5)}</td>
                        <td colSpan={joursAffiches.length}>{p.libelle}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={p.id}>
                      <td>{p.heure_debut.slice(0, 5)} - {p.heure_fin.slice(0, 5)}</td>
                      {joursAffiches.map((j) => {
                        const c = trouverCreneau(j, p.heure_debut, p.heure_fin);
                        return (
                          <td key={j}>
                            {c ? (
                              <>
                                <div>{c.matieres?.nom}</div>
                                {c.salle && <div className="text-[9px] text-gray-600">{c.salle}</div>}
                                {c.profiles && <div className="text-[9px] text-gray-500">{c.profiles.nom} {c.profiles.prenom?.charAt(0)}.</div>}
                              </>
                            ) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Liste des creneaux existants avec actions modifier/supprimer - no-print */}
      {classeId && periodes.length > 0 && !loading && (
        <div className="no-print space-y-3 border-t pt-4">
          <h3 className="font-semibold text-gray-700">Gérer les créneaux (modifier/supprimer)</h3>
          {JOURS.map((jour) => {
            const creneauxJour = creneaux.filter((c) => c.jour === jour);
            if (creneauxJour.length === 0) return null;
            return (
              <div key={jour} className="space-y-2">
                <h4 className="font-medium text-sm text-gray-600">{JOURS_LABEL[jour]}</h4>
                {creneauxJour.map((c) => (
                  <div key={c.id} className="border rounded-lg p-3 flex justify-between items-start">
                    <div>
                      <div className="font-medium">{c.heure_debut.slice(0, 5)} - {c.heure_fin.slice(0, 5)}</div>
                      <div className="text-sm text-gray-600">{c.matieres?.nom}</div>
                      <div className="text-xs text-gray-500">
                        {c.profiles?.nom} {c.profiles?.prenom}{c.salle ? ` — ${c.salle}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <button onClick={() => ouvrirFormEdition(c)} className="text-blue-600">Modifier</button>
                      <button onClick={() => supprimerCreneau(c.id)} className="text-red-600">Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {creneaux.length === 0 && (
            <p className="text-gray-500 text-sm">Aucun créneau pour cette classe.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmploiDuTempsDirectionPage() {
  return (
    <Suspense fallback={<p className="p-4 text-gray-500">Chargement...</p>}>
      <EmploiDuTempsContenu />
    </Suspense>
  );
                            }
