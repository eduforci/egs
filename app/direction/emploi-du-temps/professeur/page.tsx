'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Enseignant = {
  id: string;
  matricule: string;
  sexe: string | null;
  specialite: string | null;
  statut: string | null;
  nom: string;
  prenom: string;
  telephone: string | null;
};

type Creneau = {
  jour: string;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  classe_id: string;
  classes?: { nom: string; cycle: string | null; annee_scolaire: string | null };
  matieres?: { nom: string };
};

type Periode = { ordre: number; heure_debut: string; heure_fin: string; est_pause: boolean; libelle: string | null };

type LigneRecap = {
  classe_id: string;
  classe_nom: string;
  effectif: number;
  matiere_nom: string;
  heures_semaine: number;
};

type ComplementService = { id: string; type: string; heures: number; classes?: { nom: string } };

type Etablissement = {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  code_etablissement: string | null;
  dren: string | null;
  type_etablissement: string | null;
};

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_LABEL_MAJ: Record<string, string> = {
  lundi: 'LUNDI', mardi: 'MARDI', mercredi: 'MERCREDI',
  jeudi: 'JEUDI', vendredi: 'VENDREDI', samedi: 'SAMEDI',
};

export default function EmploiDuTempsProfesseurPage() {
  const supabase = createClient();

  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [enseignantId, setEnseignantId] = useState('');
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  const [recap, setRecap] = useState<LigneRecap[]>([]);
  const [complements, setComplements] = useState<ComplementService[]>([]);
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');

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

      const { data: ens, error } = await supabase
        .from('enseignants')
        .select('id, matricule, sexe, specialite, statut')
        .eq('etablissement_id', profil.etablissement_id);

      if (error) {
        setErreur(error.message);
        return;
      }

      if (!ens || ens.length === 0) {
        setEnseignants([]);
        return;
      }

      const idsEns = ens.map((e) => e.id);
      const { data: profs, error: profsError } = await supabase
        .from('profiles')
        .select('id, nom, prenom, telephone')
        .in('id', idsEns);

      if (profsError) {
        setErreur(profsError.message);
        return;
      }

      const profsParId = new Map((profs || []).map((p) => [p.id, p]));

      const liste: Enseignant[] = ens
        .map((e) => {
          const p = profsParId.get(e.id);
          return {
            id: e.id,
            matricule: e.matricule,
            sexe: e.sexe,
            specialite: e.specialite,
            statut: e.statut,
            nom: p?.nom ?? '',
            prenom: p?.prenom ?? '',
            telephone: p?.telephone ?? null,
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom));

      setEnseignants(liste);
    };
    load();
  }, [supabase]);

  const chargerDonnees = useCallback(async () => {
    if (!enseignantId) return;
    setLoading(true);
    setErreur('');

    const { data: creneauxData, error: creneauxError } = await supabase
      .from('emploi_du_temps')
      .select('jour, heure_debut, heure_fin, salle, classe_id, classes(nom, cycle, annee_scolaire), matieres(nom)')
      .eq('enseignant_id', enseignantId)
      .order('heure_debut');

    if (creneauxError) {
      setErreur(creneauxError.message);
      setLoading(false);
      return;
    }

    const liste = (creneauxData as any) || [];
    setCreneaux(liste);

    const cycleReference = liste[0]?.classes?.cycle;
    const anneeRef = liste[0]?.classes?.annee_scolaire || new Date().getFullYear().toString();
    setAnneeScolaire(anneeRef);

    const { data: userData } = await supabase.auth.getUser();
    const { data: profil } = await supabase
      .from('profiles')
      .select('etablissement_id')
      .eq('id', userData?.user?.id)
      .single();

    if (cycleReference && profil?.etablissement_id) {
      const { data: periodesData } = await supabase
        .from('creneaux_horaires_types')
        .select('ordre, heure_debut, heure_fin, est_pause, libelle')
        .eq('etablissement_id', profil.etablissement_id)
        .eq('cycle', cycleReference)
        .order('ordre');
      setPeriodes(periodesData || []);
    } else {
      setPeriodes([]);
    }

    const { data: recapData, error: recapError } = await supabase.rpc('recapitulatif_enseignant', {
      p_enseignant_id: enseignantId,
      p_annee_scolaire: anneeRef,
    });

    if (!recapError) setRecap(recapData || []);

    const { data: compData } = await supabase
      .from('complement_service')
      .select('id, type, heures, classes(nom)')
      .eq('enseignant_id', enseignantId)
      .eq('annee_scolaire', anneeRef);
    setComplements((compData as any) || []);

    setLoading(false);
  }, [enseignantId, supabase]);

  useEffect(() => {
    chargerDonnees();
  }, [chargerDonnees]);

  const enseignant = enseignants.find((e) => e.id === enseignantId);

  const trouverCreneau = (jour: string, heureDebut: string, heureFin: string) => {
    return creneaux.find(
      (c) => c.jour === jour && c.heure_debut.slice(0, 5) === heureDebut.slice(0, 5) && c.heure_fin.slice(0, 5) === heureFin.slice(0, 5)
    );
  };

  const joursAffiches = JOURS.slice(0, 5).concat(creneaux.some((c) => c.jour === 'samedi') ? ['samedi'] : []);

  const totalHeuresRecap = recap.reduce((sum, r) => sum + Number(r.heures_semaine || 0), 0);
  const pp = complements.filter((c) => c.type === 'PP');
  const autresComplements = complements.filter((c) => c.type !== 'PP');

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
        <h1 className="text-2xl font-bold">Emploi du temps professeur</h1>
        <div>
          <label className="block text-sm font-medium mb-1">Enseignant</label>
          <select
            value={enseignantId}
            onChange={(e) => setEnseignantId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">-- Sélectionner un enseignant --</option>
            {enseignants.map((e) => (
              <option key={e.id} value={e.id}>{e.nom} {e.prenom}</option>
            ))}
          </select>
        </div>

        {erreur && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {erreur}
          </div>
        )}

        {enseignantId && (
          <button
            onClick={() => window.print()}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium"
          >
            🖨️ Imprimer / Exporter en PDF
          </button>
        )}
      </div>

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && enseignant && etablissement && (
        <div className="space-y-3">
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
              <div>Année Scolaire : {anneeScolaire}</div>
              {etablissement.code_etablissement && <div>Code : {etablissement.code_etablissement}</div>}
              {etablissement.type_etablissement && <div>Statut : {etablissement.type_etablissement}</div>}
            </div>
          </div>

          <h2 className="text-center font-bold text-lg border py-1">EMPLOI DU TEMPS PROFESSEUR</h2>

          <div>
            <h3 className="font-bold text-base">
              M. {enseignant.nom} {enseignant.prenom} {enseignant.specialite ? `(${enseignant.specialite.toUpperCase()})` : ''}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mt-1">
              <div><strong>Matricule:</strong> {enseignant.matricule}</div>
              <div><strong>Sexe:</strong> {enseignant.sexe || '—'}</div>
              <div><strong>Statut:</strong> {enseignant.statut || '—'}</div>
              <div><strong>Contact:</strong> {enseignant.telephone || '—'}</div>
            </div>
            {pp.length > 0 && (
              <div className="text-sm mt-1">
                <strong>Professeur principal :</strong> {pp.map((p) => p.classes?.nom).join(', ')}
              </div>
            )}
          </div>

          {periodes.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Aucune grille horaire disponible pour cet enseignant (pas de créneau créé, ou cycle sans grille configurée).
            </p>
          ) : (
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
                        <tr key={`${p.heure_debut}-${p.heure_fin}`} className="pause-row">
                          <td>{p.heure_debut.slice(0, 5)} - {p.heure_fin.slice(0, 5)}</td>
                          <td colSpan={joursAffiches.length}>{p.libelle}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`${p.heure_debut}-${p.heure_fin}`}>
                        <td>{p.heure_debut.slice(0, 5)} - {p.heure_fin.slice(0, 5)}</td>
                        {joursAffiches.map((j) => {
                          const c = trouverCreneau(j, p.heure_debut, p.heure_fin);
                          return (
                            <td key={j}>
                              {c ? (
                                <>
                                  <div>{c.classes?.nom} {c.matieres?.nom}</div>
                                  {c.salle && <div className="text-[9px] text-gray-600">{c.salle}</div>}
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
          )}

          {recap.length > 0 && (
            <div>
              <h3 className="font-bold mb-2">TABLEAU RÉCAPITULATIF</h3>
              <div className="overflow-x-auto">
                <table className="edt-table w-full border-collapse">
                  <thead>
                    <tr>
                      <th>CLASSES</th>
                      {recap.map((r) => (
                        <th key={r.classe_id + r.matiere_nom}>{r.classe_nom}</th>
                      ))}
                      <th>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-left font-medium">EFFECTIFS</td>
                      {recap.map((r) => (
                        <td key={r.classe_id + 'eff'}>{r.effectif}</td>
                      ))}
                      <td>—</td>
                    </tr>
                    <tr>
                      <td className="text-left font-medium">DISCIPLINES</td>
                      {recap.map((r) => (
                        <td key={r.classe_id + 'disc'}>{r.matiere_nom}</td>
                      ))}
                      <td>—</td>
                    </tr>
                    <tr>
                      <td className="text-left font-medium">HEURES D'ENSEIG.</td>
                      {recap.map((r) => (
                        <td key={r.classe_id + 'h'}>{r.heures_semaine}H</td>
                      ))}
                      <td className="font-bold">{totalHeuresRecap}H</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {autresComplements.length > 0 && (
            <div>
              <h3 className="font-bold mb-2">COMPLÉMENT DE SERVICE</h3>
              <div className="flex flex-wrap gap-2">
                {autresComplements.map((c) => (
                  <div key={c.id} className="border rounded-lg px-3 py-1.5 text-sm">
                    {c.type} {c.classes?.nom ? `(${c.classes.nom})` : ''} — {c.heures}H
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
