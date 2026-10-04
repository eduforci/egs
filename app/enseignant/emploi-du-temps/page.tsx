'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import EnseignantNav from '@/components/enseignant-nav';

type Creneau = {
  id: string;
  jour: string;
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
  classe_id: string | null;
  matiere_id: string | null;
  enseignant_id: string | null;
  classes?: { nom: string; cycle: string | null } | null;
  matieres?: { nom: string } | null;
};

type Etablissement = {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  code_etablissement: string | null;
  dren: string | null;
  type_etablissement: string | null;
  logo_url: string | null;
  armoirie_url: string | null;
  devise: string | null;
  chef_etablissement_nom: string | null;
  chef_etablissement_titre: string | null;
};

type Ligne = {
  cle: string;
  debut: string;
  fin: string;
  pause: boolean;
  libelle: string | null;
};

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_LABEL_MAJ: Record<string, string> = {
  lundi: 'LUNDI',
  mardi: 'MARDI',
  mercredi: 'MERCREDI',
  jeudi: 'JEUDI',
  vendredi: 'VENDREDI',
  samedi: 'SAMEDI',
};

const hm = (t: string) => t.slice(0, 5);

export default function EmploiDuTempsEnseignantPage() {
  const supabase = createClient();
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [nomEnseignant, setNomEnseignant] = useState('');
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [classesNoms, setClassesNoms] = useState<string[]>([]);
  const [anneeScolaire, setAnneeScolaire] = useState('');
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }

      const { data: profil } = await supabase
        .from('profiles')
        .select('nom, prenom, etablissement_id')
        .eq('id', uid)
        .single();
      setNomEnseignant(`${profil?.nom ?? ''} ${profil?.prenom ?? ''}`.trim());

      // Classes et matières affectées à l'enseignant : un créneau de l'emploi du temps
      // compte pour lui même si la direction n'a pas indiqué son nom sur le créneau.
      const { data: affectations } = await supabase
        .from('affectations_enseignant')
        .select('classe_id, matiere_id, classes(nom, annee_scolaire), matieres(nom)')
        .eq('enseignant_id', uid);

      const aff = (affectations || []) as any[];
      const paires = new Set(aff.map((a) => `${a.classe_id}|${a.matiere_id}`));
      const classeIds = Array.from(new Set(aff.map((a) => a.classe_id).filter(Boolean))) as string[];

      setDisciplines(
        Array.from(new Set(aff.map((a) => a.matieres?.nom).filter(Boolean))) as string[]
      );
      setClassesNoms(
        Array.from(new Set(aff.map((a) => a.classes?.nom).filter(Boolean))) as string[]
      );
      const annee = aff.map((a) => a.classes?.annee_scolaire).find(Boolean);
      if (annee) setAnneeScolaire(annee);

      let requete = supabase
        .from('emploi_du_temps')
        .select(
          'id, jour, heure_debut, heure_fin, salle, classe_id, matiere_id, enseignant_id, classes(nom, cycle), matieres(nom)'
        )
        .order('heure_debut');

      requete =
        classeIds.length > 0
          ? requete.or(
              `enseignant_id.eq.${uid},and(enseignant_id.is.null,classe_id.in.(${classeIds.join(',')}))`
            )
          : requete.eq('enseignant_id', uid);

      const { data, error } = await requete;

      if (error) {
        setErreur(error.message);
        setLoading(false);
        return;
      }

      const liste: Creneau[] = ((data as any) || []).filter(
        (c: Creneau) =>
          c.enseignant_id === uid || paires.has(`${c.classe_id}|${c.matiere_id}`)
      );
      setCreneaux(liste);

      // En-tête officiel : informations de l'établissement
      if (profil?.etablissement_id) {
        const { data: etab } = await supabase
          .from('etablissements')
          .select(
            'nom, adresse, telephone, code_etablissement, dren, type_etablissement, logo_url, armoirie_url, devise, chef_etablissement_nom, chef_etablissement_titre'
          )
          .eq('id', profil.etablissement_id)
          .single();
        setEtablissement((etab as any) || null);
      }

      // Grille horaire (avec récréation, pause de midi...) des cycles de ses classes
      const map = new Map<string, Ligne>();
      const cycles = Array.from(
        new Set(liste.map((c) => c.classes?.cycle).filter(Boolean))
      ) as string[];

      if (profil?.etablissement_id && cycles.length > 0) {
        const { data: periodes } = await supabase
          .from('creneaux_horaires_types')
          .select('heure_debut, heure_fin, est_pause, libelle')
          .eq('etablissement_id', profil.etablissement_id)
          .in('cycle', cycles);

        ((periodes as any[]) || []).forEach((p) => {
          const cle = `${hm(p.heure_debut)}-${hm(p.heure_fin)}`;
          const existante = map.get(cle);
          if (existante) {
            if (!p.est_pause) existante.pause = false;
          } else {
            map.set(cle, {
              cle,
              debut: hm(p.heure_debut),
              fin: hm(p.heure_fin),
              pause: !!p.est_pause,
              libelle: p.libelle ?? null,
            });
          }
        });
      }

      // Tout cours placé à une heure absente de la grille garde sa propre ligne
      liste.forEach((c) => {
        const cle = `${hm(c.heure_debut)}-${hm(c.heure_fin)}`;
        const existante = map.get(cle);
        if (existante) {
          existante.pause = false;
        } else {
          map.set(cle, {
            cle,
            debut: hm(c.heure_debut),
            fin: hm(c.heure_fin),
            pause: false,
            libelle: null,
          });
        }
      });

      setLignes(
        Array.from(map.values()).sort((a, b) =>
          a.debut === b.debut ? a.fin.localeCompare(b.fin) : a.debut.localeCompare(b.debut)
        )
      );
      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const joursAffiches = JOURS.slice(0, 5).concat(
    creneaux.some((c) => c.jour === 'samedi') ? ['samedi'] : []
  );

  const coursDe = (jour: string, ligne: Ligne) =>
    creneaux.filter(
      (c) =>
        c.jour === jour &&
        hm(c.heure_debut) === ligne.debut &&
        hm(c.heure_fin) === ligne.fin
    );

  const totalHeures = creneaux.reduce((somme, c) => {
    const [h1, m1] = hm(c.heure_debut).split(':').map(Number);
    const [h2, m2] = hm(c.heure_fin).split(':').map(Number);
    return somme + (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
  }, 0);
  const totalAffiche = Number(totalHeures.toFixed(2));

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
        <EnseignantNav />
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Mon emploi du temps</h1>
          {creneaux.length > 0 && (
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium"
            >
              🖨️ Imprimer
            </button>
          )}
        </div>

        {erreur && (
          <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {erreur}
          </div>
        )}

        {creneaux.length === 0 && !erreur && (
          <p className="text-gray-500 text-sm">Aucun cours planifié.</p>
        )}
      </div>

      {/* Format officiel "Emploi du temps" (même présentation que la direction) */}
      {creneaux.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex justify-between items-start text-[10px] font-bold leading-tight">
            <div className="flex items-start gap-2">
              {etablissement?.logo_url && (
                <img
                  src={etablissement.logo_url}
                  alt="Logo établissement"
                  className="w-14 h-14 object-contain shrink-0"
                />
              )}
              <div>
                <div>MINISTÈRE DE L'ÉDUCATION NATIONALE,</div>
                <div>DE L'ALPHABÉTISATION ET DE</div>
                <div>L'ENSEIGNEMENT TECHNIQUE</div>
                {etablissement?.dren && <div>DRENA {etablissement.dren.toUpperCase()}</div>}
              </div>
            </div>
            <div className="flex items-start gap-2 text-right">
              <div>
                <div>RÉPUBLIQUE DE CÔTE D'IVOIRE</div>
                <div>{etablissement?.devise || 'Union - Discipline - Travail'}</div>
              </div>
              {etablissement?.armoirie_url && (
                <img
                  src={etablissement.armoirie_url}
                  alt="Armoiries"
                  className="w-14 h-14 object-contain shrink-0"
                />
              )}
            </div>
          </div>

          <div className="flex justify-between items-start text-sm border-b pb-2">
            <div>
              <div className="font-bold">{etablissement?.nom}</div>
              {etablissement?.telephone && (
                <div className="text-xs">Tél : {etablissement.telephone}</div>
              )}
              {etablissement?.adresse && <div className="text-xs">{etablissement.adresse}</div>}
            </div>
            <div className="text-right text-xs">
              <div>Année Scolaire : {anneeScolaire || '—'}</div>
              {etablissement?.code_etablissement && (
                <div>Code : {etablissement.code_etablissement}</div>
              )}
              {etablissement?.type_etablissement && (
                <div>Statut : {etablissement.type_etablissement}</div>
              )}
            </div>
          </div>

          <h2 className="text-center font-bold text-lg border py-1">
            EMPLOI DU TEMPS ENSEIGNANT : {nomEnseignant.toUpperCase()}
          </h2>

          {disciplines.length > 0 && (
            <div className="text-sm">
              <strong>DISCIPLINE(S) :</strong> {disciplines.join(', ')}
            </div>
          )}
          {classesNoms.length > 0 && (
            <div className="text-sm">
              <strong>CLASSES :</strong> {classesNoms.join(', ')}
            </div>
          )}
          <div className="text-sm">
            <strong>NOMBRE HEURES DE COURS PAR SEMAINE =</strong> {totalAffiche}H
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
                {lignes.map((l) => {
                  if (l.pause) {
                    return (
                      <tr key={l.cle} className="pause-row">
                        <td>
                          {l.debut} - {l.fin}
                        </td>
                        <td colSpan={joursAffiches.length}>{l.libelle}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={l.cle}>
                      <td>
                        {l.debut} - {l.fin}
                      </td>
                      {joursAffiches.map((j) => {
                        const cours = coursDe(j, l);
                        return (
                          <td key={j}>
                            {cours.map((c) => (
                              <div key={c.id}>
                                <div>{c.matieres?.nom}</div>
                                <div className="text-[9px] font-bold">{c.classes?.nom}</div>
                                {c.salle && (
                                  <div className="text-[9px] text-gray-600">{c.salle}</div>
                                )}
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-end text-xs pt-8">
            <div className="w-1/3"></div>
            <div className="w-1/3 text-center text-[9px] leading-tight text-gray-600">
              <div>MENA | DESPS | EGS</div>
              <div>Page 1 sur 1</div>
            </div>
            <div className="w-1/3 text-right">
              {etablissement?.chef_etablissement_nom && (
                <>
                  <div className="font-bold">{etablissement.chef_etablissement_nom}</div>
                  <div className="text-[10px]">
                    {etablissement.chef_etablissement_titre || "Chef d'Établissement"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
