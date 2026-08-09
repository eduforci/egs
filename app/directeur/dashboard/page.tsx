'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Stats = {
  nbClasses: number;
  nbMatieres: number;
  nbNotes: number;
  nbAbsences: number;
  notesAValider: number;
  bulletinsAPreparer: number;
};

export default function DashboardDirecteurEtudes() {
  const supabase = createClient();
  const [prenom, setPrenom] = useState('');
  const [etablissementNom, setEtablissementNom] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
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
      const anneeScolaire = etab?.annee_scolaire_active || new Date().getFullYear().toString();

      const { count: nbClasses } = await supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('etablissement_id', profil.etablissement_id);

      const { count: nbMatieres } = await supabase
        .from('matieres')
        .select('id', { count: 'exact', head: true })
        .eq('etablissement_id', profil.etablissement_id);

      const { count: nbNotes } = await supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('annee_scolaire', anneeScolaire);

      const { count: nbAbsences } = await supabase
        .from('absences')
        .select('id', { count: 'exact', head: true })
        .eq('etablissement_id', profil.etablissement_id)
        .eq('type', 'absence');

      const aujourdHui = new Date().toISOString().slice(0, 10);

      const { data: trimestreActif } = await supabase
        .from('trimestres')
        .select('numero')
        .eq('etablissement_id', profil.etablissement_id)
        .lte('date_debut', aujourdHui)
        .gte('date_fin', aujourdHui)
        .maybeSingle();

      let trimestreNum = trimestreActif?.numero;

      if (!trimestreNum) {
        const { data: dernierTrimestre } = await supabase
          .from('trimestres')
          .select('numero')
          .eq('etablissement_id', profil.etablissement_id)
          .order('numero', { ascending: false })
          .limit(1)
          .maybeSingle();
        trimestreNum = dernierTrimestre?.numero || 1;
      }

      const { data: combosAvecNotes } = await supabase
        .from('notes')
        .select('classe_id, matiere_id')
        .eq('annee_scolaire', anneeScolaire)
        .eq('trimestre', trimestreNum);

      const combosUniques = new Set(
        (combosAvecNotes || []).map((n) => `${n.classe_id}__${n.matiere_id}`)
      );

      const { data: validations } = await supabase
        .from('validations_notes')
        .select('classe_id, matiere_id, valide')
        .eq('annee_scolaire', anneeScolaire)
        .eq('trimestre', trimestreNum)
        .eq('valide', true);

      const combosValidees = new Set(
        (validations || []).map((v) => `${v.classe_id}__${v.matiere_id}`)
      );

      let notesAValider = 0;
      combosUniques.forEach((combo) => {
        if (!combosValidees.has(combo)) notesAValider++;
      });

      setStats({
        nbClasses: nbClasses || 0,
        nbMatieres: nbMatieres || 0,
        nbNotes: nbNotes || 0,
        nbAbsences: nbAbsences || 0,
        notesAValider,
        bulletinsAPreparer: combosValidees.size > 0 ? (nbClasses || 0) : 0,
      });

      setLoading(false);
    };
    charger();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;
  if (erreur) return <p className="p-4 text-red-600">{erreur}</p>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bonjour, {prenom} 👋</h1>
        <p className="text-gray-600">Direction des études</p>
        <p className="text-sm text-gray-500">{etablissementNom}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{stats?.nbClasses}</div>
          <div className="text-xs text-gray-500 mt-1">Classes</div>
        </div>
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{stats?.nbMatieres}</div>
          <div className="text-xs text-gray-500 mt-1">Matières</div>
        </div>
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{stats?.nbNotes}</div>
          <div className="text-xs text-gray-500 mt-1">Notes</div>
        </div>
        <div className="border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{stats?.nbAbsences}</div>
          <div className="text-xs text-gray-500 mt-1">Absences</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Suivi pédagogique</h2>
          <Link href="/directeur/notes-validation" className="flex justify-between items-center text-sm py-1.5 border-b">
            <span>Notes à valider</span>
            <span className="font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">
              {stats?.notesAValider}
            </span>
          </Link>
          <Link href="/directeur/bulletins" className="flex justify-between items-center text-sm py-1.5 border-b">
            <span>Bulletins à préparer</span>
            <span className="font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
              {stats?.bulletinsAPreparer}
            </span>
          </Link>
          <Link href="/directeur/absences" className="flex justify-between items-center text-sm py-1.5 border-b">
            <span>Absences</span>
            <span className="font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
              {stats?.nbAbsences}
            </span>
          </Link>
          <Link href="/direction/emploi-du-temps" className="flex justify-between items-center text-sm py-1.5">
            <span>Emplois du temps</span>
            <span className="text-gray-400">→</span>
          </Link>
        </div>

        <div className="border rounded-xl p-4 space-y-2">
          <h2 className="font-semibold mb-2">Actions rapides</h2>
          <Link href="/directeur/notes-validation" className="flex items-center gap-2 text-sm py-2 border-b">
            📝 <span>Saisie / suivi notes</span>
          </Link>
          <Link href="/directeur/resultats" className="flex items-center gap-2 text-sm py-2 border-b">
            📊 <span>Résultats</span>
          </Link>
          <Link href="/direction/emploi-du-temps" className="flex items-center gap-2 text-sm py-2 border-b">
            📅 <span>Emploi du temps</span>
          </Link>
          <Link href="/directeur/bulletins" className="flex items-center gap-2 text-sm py-2">
            📄 <span>Bulletins</span>
          </Link>
        </div>
      </div>

      <div className="border rounded-xl p-4">
        <h2 className="font-semibold mb-2">Activité pédagogique</h2>
        <p className="text-sm text-gray-600">
          Classes • Notes • Absences • Bulletins • Examens
        </p>
      </div>
    </div>
  );
              }
