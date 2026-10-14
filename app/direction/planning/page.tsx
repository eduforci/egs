'use client';

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
    href: '/direction/planning/volumes',
    icone: '🧮',
    titre: '3. Volumes horaires',
    texte: 'Heures par semaine de chaque matière : remplies automatiquement avec le tableau officiel.',
  },
  {
    href: '/direction/planning/professeurs',
    icone: '🧑‍🏫',
    titre: '4. Professeurs et vacataires',
    texte: "Qui est vacataire, ses jours et heures de disponibilité, son plafond d'heures.",
  },
  {
    href: '/direction/planning/generer',
    icone: '⚡',
    titre: "5. Générer l'emploi du temps",
    texte: 'Le logiciel place les cours des classes dans des salles libres, sans conflit de professeurs.',
  },
  {
    href: '/direction/planning/remplacement',
    icone: '🔁',
    titre: '6. Remplacer un professeur',
    texte: 'Un professeur part ou est absent longtemps : reprenez tous ses cours en une fois.',
    bientot: true,
  },
];

export default function PlanningAccueilPage() {
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
