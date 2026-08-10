'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Classe = { id: string; nom: string };
type Annonce = {
  id: string;
  titre: string;
  contenu: string;
  classe_id: string | null;
  classe_nom: string | null;
  created_at: string;
};

export default function MessagerieDirectionPage() {
  const supabase = createClient();

  const [classes, setClasses] = useState<Classe[]>([]);
  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [classeId, setClasseId] = useState('');
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [etablissementId, setEtablissementId] = useState('');

  const charger = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data: profil } = await supabase
      .from('profiles')
      .select('etablissement_id')
      .eq('id', userData.user.id)
      .single();

    if (!profil?.etablissement_id) {
      setLoading(false);
      return;
    }
    setEtablissementId(profil.etablissement_id);

    const { data: classesData } = await supabase
      .from('classes')
      .select('id, nom')
      .eq('etablissement_id', profil.etablissement_id)
      .order('nom');
    setClasses(classesData || []);

    const { data: annoncesData } = await supabase
      .from('annonces')
      .select('id, titre, contenu, classe_id, classes(nom), created_at')
      .eq('etablissement_id', profil.etablissement_id)
      .order('created_at', { ascending: false });

    setAnnonces(
      (annoncesData || []).map((a: any) => ({
        id: a.id,
        titre: a.titre,
        contenu: a.contenu,
        classe_id: a.classe_id,
        classe_nom: a.classes?.nom || null,
        created_at: a.created_at,
      }))
    );

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const publier = async () => {
    if (!titre.trim() || !contenu.trim()) {
      setMessage({ type: 'error', text: 'Titre et contenu obligatoires.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from('annonces').insert({
      etablissement_id: etablissementId,
      titre: titre.trim(),
      contenu: contenu.trim(),
      classe_id: classeId || null,
      auteur_id: userData?.user?.id,
    });

    if (error) {
      setMessage({ type: 'error', text: 'Erreur: ' + error.message });
      setSaving(false);
      return;
    }

    setMessage({ type: 'success', text: 'Annonce publiée.' });
    setTitre('');
    setContenu('');
    setClasseId('');
    setSaving(false);
    charger();
  };

  const supprimer = async (id: string) => {
    const { error } = await supabase.from('annonces').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Erreur suppression: ' + error.message });
      return;
    }
    charger();
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Messagerie — Annonces</h1>

      <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
        <div>
          <label className="block text-sm font-medium mb-1">Titre</label>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="w-full border rounded-lg p-2"
            placeholder="Ex: Réunion parents-professeurs"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message</label>
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            className="w-full border rounded-lg p-2 min-h-24"
            placeholder="Votre message..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Destinataires</label>
          <select
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            className="w-full border rounded-lg p-2"
          >
            <option value="">Tous les parents de l'établissement</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>Uniquement {c.nom}</option>
            ))}
          </select>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <button
          onClick={publier}
          disabled={saving}
          className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? 'Publication...' : 'Publier l\'annonce'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold text-gray-700">Annonces publiées</h2>
        {annonces.length === 0 && (
          <p className="text-gray-500 text-sm">Aucune annonce publiée.</p>
        )}
        {annonces.map((a) => (
          <div key={a.id} className="border rounded-lg p-3">
            <div className="flex justify-between items-start">
              <div className="font-medium">{a.titre}</div>
              <button onClick={() => supprimer(a.id)} className="text-red-600 text-sm">Supprimer</button>
            </div>
            <p className="text-sm text-gray-600 mt-1">{a.contenu}</p>
            <div className="text-xs text-gray-400 mt-2">
              {a.classe_nom ? `Destiné à ${a.classe_nom}` : 'Tout l\'établissement'} — {new Date(a.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  }
