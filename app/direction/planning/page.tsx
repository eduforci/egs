'use client';

import { useState } from 'react';
import Link from 'next/link';

const ETAPES: { href: string; icone: string; titre: string; texte: string; bientot?: boolean }[] = [
  {
    href: '/direction/planning/ecole',
    icone: '🏫',
    titre: "1. Jours et heures de l'école",
    texte: 'Jours de cours (samedi ou non), heures de cours et pauses de votre école.',
  },
  {
    href: '/direction/planning/salles',
    icone: '🚪',
    titre: '2. Salles',
    texte: "Les salles de l'école : une salle n'accueille jamais deux classes en même temps.",
  },
  {
    href: '/direction/planning/niveaux',
    icone: '📚',
    titre: '3. Matières par niveau',
    texte: "Les matières enseignées dans chaque niveau (6e, 5e, 2nde...), et l'ajout de matières comme TIC ou arabe avec leurs heures.",
  },
  {
    href: '/direction/planning/volumes',
    icone: '🧮',
    titre: '4. Volumes horaires',
    texte: 'Heures par semaine de chaque matière : remplies automatiquement avec le tableau officiel.',
  },
  {
    href: '/direction/planning/professeurs',
    icone: '🧑‍🏫',
    titre: '5. Professeurs et vacataires',
    texte: "Qui est vacataire, ses jours et heures de disponibilité, son plafond d'heures.",
  },
  {
    href: '/direction/planning/devoirs',
    icone: '📝',
    titre: 'Devoirs de niveau (facultatif)',
    texte: 'Un après-midi sans cours pour les devoirs de 3e, de Terminale ou d\'autres niveaux.',
  },
  {
    href: '/direction/planning/generer',
    icone: '⚡',
    titre: "6. Générer l'emploi du temps",
    texte: 'Le logiciel place les cours des classes dans des salles libres, sans conflit de professeurs.',
  },
  {
    href: '/direction/planning/enseignants',
    icone: '🖨️',
    titre: '7. Emplois du temps des enseignants',
    texte: "Une fois les classes prêtes : voir et imprimer l'emploi du temps de chaque enseignant, ou de tous en une fois.",
  },
  {
    href: '/direction/planning/remplacement',
    icone: '🔁',
    titre: '8. Remplacer un professeur',
    texte: 'Un professeur part ou est absent longtemps : reprenez tous ses cours en une fois.',
    bientot: true,
  },
];

export default function PlanningAccueilPage() {
  const [synchro, setSynchro] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  const synchroniser = async () => {
    setOccupe(true);
    setSynchro(null);
    try {
      const r = await fetch('/api/planning/synchroniser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Échec.');
      const n = j.matieresAjoutees + j.affectationsAjoutees + j.affectationsRemplacees;
      setSynchro({
        ok: true,
        texte: n === 0
          ? 'Tout est déjà à jour : les classes ont déjà les matières et les enseignants de leurs emplois du temps.'
          : `${j.matieresAjoutees} matière(s) ajoutée(s) aux classes, ${j.affectationsAjoutees} enseignant(s) affecté(s)` +
            (j.affectationsRemplacees ? `, ${j.affectationsRemplacees} ancienne(s) affectation(s) remplacée(s)` : '') + '.',
      });
    } catch (e) {
      setSynchro({ ok: false, texte: e instanceof Error ? e.message : 'Erreur inconnue' });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Planning</h1>
        <p className="text-sm text-gray-500">Emploi du temps automatique : suivez les étapes dans l'ordre.</p>
      </div>

      <div className="space-y-2">
        {ETAPES.map((e) =>
          e.bientot ? (
            <div key={e.href} className="border rounded-xl p-4 bg-gray-50 opacity-60">
              <div className="font-semibold">
                <span className="mr-2">{e.icone}</span>
                {e.titre} <span className="text-xs font-normal">(bientôt)</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{e.texte}</p>
            </div>
          ) : (
            <Link key={e.href} href={e.href} className="block border rounded-xl p-4 bg-white hover:bg-gray-50">
              <div className="font-semibold">
                <span className="mr-2">{e.icone}</span>
                {e.titre}
              </div>
              <p className="text-sm text-gray-600 mt-1">{e.texte}</p>
            </Link>
          )
        )}
      </div>

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <div className="font-semibold">🔗 Mettre à jour les enseignants des classes</div>
        <p className="text-sm text-gray-600">
          Les classes reçoivent automatiquement les matières et les enseignants de leurs emplois du temps. Ce bouton remet à jour
          toutes les classes d'un coup, par exemple pour des emplois du temps déjà enregistrés avant cette fonction.
        </p>
        <button onClick={synchroniser} disabled={occupe} className="w-full rounded-md py-2.5 text-sm bg-blue-600 text-white disabled:opacity-50">
          {occupe ? 'Mise à jour…' : 'Mettre à jour maintenant'}
        </button>
        {synchro && (
          <div className={`text-sm rounded-md p-2 border ${synchro.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-700'}`}>{synchro.texte}</div>
        )}
      </div>

      <div className="text-xs text-gray-500 border rounded-lg p-3 bg-gray-50">
        Les emplois du temps générés sont les mêmes que ceux de la page « Emploi du temps » : impression et affichage pour
        les enseignants, parents et élèves restent inchangés. Vous pouvez ensuite les corriger à la main.
      </div>

      <Link href="/direction/emploi-du-temps" className="text-sm text-blue-600 underline">
        Ouvrir l'emploi du temps classique
      </Link>
    </div>
  );
}
