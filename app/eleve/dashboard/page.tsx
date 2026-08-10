'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function DashboardEleve() {
  const supabase = createClient();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [classeNom, setClasseNom] = useState('');
  const [matricule, setMatricule] = useState('');
  const [etablissementNom, setEtablissementNom] = useState('');
  const [absencesNonJustifiees, setAbsencesNonJustifiees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: profil } = await supabase
        .from('profiles')
        .select('nom, prenom, etablissement_id')
        .eq('id', userData.user.id)
        .single();

      if (!profil?.etablissement_id) {
        setErreur("Établissement introuvable pour ce compte.");
        setLoading(false);
        return;
      }

      setNom(profil.nom || '');
      setPrenom(profil.prenom || '');

      const { data: etab } = await supabase
        .from('etablissements')
        .select('nom')
        .eq('id', profil.etablissement_id)
        .single();
      setEtablissementNom(etab?.nom || '');

      const { data: eleve } = await supabase
        .from('eleves')
        .select('matricule, classe_id, classes(nom)')
        .eq('id', userData.user.id)
        .single();

      setMatricule(eleve?.matricule || '');
      setClasseNom((eleve as any)?.classes?.nom || '');

      const { count } = await supabase
        .from('absences')
        .select('id', { count: 'exact', head: true })
        .eq('eleve_id', userData.user.id)
        .eq('type', 'absence')
        .eq('justifie', false);

      setAbsencesNonJustifiees(count || 0);
      setLoading(false);
    };
    charger();
  }, [supabase]);

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bonjour, {prenom} 👋</h1>
        <p className="text-gray-600">Espace élève</p>
        <p className="text-sm text-gray-500">{etablissementNom}</p>
      </div>

      {erreur && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {erreur}
        </div>
      )}

      <div className="border rounded-xl p-4 space-y-1">
        <div className="font-semibold text-lg">{nom} {prenom}</div>
        <div className="text-sm text-gray-500">{classeNom} — {matricule}</div>
        {absencesNonJustifiees > 0 && (
          <div className="mt-1 inline-block text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
            {absencesNonJustifiees} absence(s) non justifiée(s)
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/absences"
          className="text-center text-sm border rounded-lg py-4 hover:bg-gray-50"
        >
          📋<br />Mes absences
        </Link>
        <Link
          href="/emploi-du-temps"
          className="text-center text-sm border rounded-lg py-4 hover:bg-gray-50"
        >
          📅<br />Mon emploi du temps
        </Link>
      </div>
    </div>
  );
}
