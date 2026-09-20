'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

type EtablissementForm = {
  logo_url: string | null;
  armoirie_url: string | null;
  devise: string | null;
  chef_etablissement_nom: string | null;
  chef_etablissement_titre: string | null;
};

const BUCKET = 'etablissements';

export default function ParametresEtablissementPage() {
  const supabase = createClient();
  const [etablissementId, setEtablissementId] = useState('');
  const [form, setForm] = useState<EtablissementForm>({
    logo_url: null,
    armoirie_url: null,
    devise: '',
    chef_etablissement_nom: '',
    chef_etablissement_titre: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingArmoirie, setUploadingArmoirie] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const armoirieInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const charger = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setLoading(false); return; }

      const { data: profil } = await supabase
        .from('profiles')
        .select('etablissement_id')
        .eq('id', userData.user.id)
        .single();

      if (!profil?.etablissement_id) { setLoading(false); return; }
      setEtablissementId(profil.etablissement_id);

      const { data, error } = await supabase
        .from('etablissements')
        .select('logo_url, armoirie_url, devise, chef_etablissement_nom, chef_etablissement_titre')
        .eq('id', profil.etablissement_id)
        .single();

      if (!error && data) {
        setForm({
          logo_url: data.logo_url,
          armoirie_url: data.armoirie_url,
          devise: data.devise || '',
          chef_etablissement_nom: data.chef_etablissement_nom || '',
          chef_etablissement_titre: data.chef_etablissement_titre || '',
        });
      }
      setLoading(false);
    };
    charger();
  }, [supabase]);

  const uploaderImage = async (
    file: File,
    champ: 'logo_url' | 'armoirie_url',
    setUploading: (v: boolean) => void
  ) => {
    if (!etablissementId) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image trop lourde (max 2 Mo).' });
      return;
    }

    setUploading(true);
    setMessage(null);

    const extension = file.name.split('.').pop();
    const chemin = `${etablissementId}/${champ}-${Date.now()}.${extension}`;

    const { error: errUpload } = await supabase.storage
      .from(BUCKET)
      .upload(chemin, file, { upsert: true });

    if (errUpload) {
      setMessage({ type: 'error', text: "Erreur d'upload : " + errUpload.message });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(chemin);
    const publicUrl = urlData.publicUrl;

    const { error: errUpdate } = await supabase
      .from('etablissements')
      .update({ [champ]: publicUrl })
      .eq('id', etablissementId);

    if (errUpdate) {
      setMessage({ type: 'error', text: 'Erreur enregistrement : ' + errUpdate.message });
      setUploading(false);
      return;
    }

    setForm((f) => ({ ...f, [champ]: publicUrl }));
    setUploading(false);
    setMessage({ type: 'success', text: 'Image enregistrée.' });
  };

  const enregistrerTexte = async () => {
    if (!etablissementId) return;
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('etablissements')
      .update({
        devise: form.devise || null,
        chef_etablissement_nom: form.chef_etablissement_nom || null,
        chef_etablissement_titre: form.chef_etablissement_titre || null,
      })
      .eq('id', etablissementId);

    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: 'Erreur : ' + error.message });
      return;
    }
    setMessage({ type: 'success', text: 'Informations enregistrées.' });
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-5">
      <h1 className="text-2xl font-bold">Paramètres de l'établissement</h1>
      <p className="text-sm text-gray-500">
        Ces éléments apparaissent sur l'emploi du temps imprimé (logo, armoiries, devise, chef d'établissement).
      </p>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Logo */}
      <div className="border rounded-lg p-3 space-y-2">
        <label className="block text-sm font-medium">Logo de l'établissement</label>
        <div className="flex items-center gap-3">
          {form.logo_url ? (
            <img src={form.logo_url} alt="Logo" className="w-16 h-16 object-contain border rounded" />
          ) : (
            <div className="w-16 h-16 border rounded flex items-center justify-center text-xs text-gray-400">Aucun</div>
          )}
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadingLogo}
            className="bg-gray-800 text-white text-sm py-2 px-3 rounded-lg disabled:opacity-50"
          >
            {uploadingLogo ? 'Envoi...' : form.logo_url ? 'Changer' : 'Choisir une image'}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploaderImage(f, 'logo_url', setUploadingLogo);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Armoiries */}
      <div className="border rounded-lg p-3 space-y-2">
        <label className="block text-sm font-medium">Armoiries (République de Côte d'Ivoire)</label>
        <div className="flex items-center gap-3">
          {form.armoirie_url ? (
            <img src={form.armoirie_url} alt="Armoiries" className="w-16 h-16 object-contain border rounded" />
          ) : (
            <div className="w-16 h-16 border rounded flex items-center justify-center text-xs text-gray-400">Aucune</div>
          )}
          <button
            onClick={() => armoirieInputRef.current?.click()}
            disabled={uploadingArmoirie}
            className="bg-gray-800 text-white text-sm py-2 px-3 rounded-lg disabled:opacity-50"
          >
            {uploadingArmoirie ? 'Envoi...' : form.armoirie_url ? 'Changer' : 'Choisir une image'}
          </button>
          <input
            ref={armoirieInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploaderImage(f, 'armoirie_url', setUploadingArmoirie);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Devise + chef d'établissement */}
      <div className="border rounded-lg p-3 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Devise</label>
          <input
            type="text"
            value={form.devise || ''}
            onChange={(e) => setForm({ ...form, devise: e.target.value })}
            placeholder="Union - Discipline - Travail"
            className="w-full border rounded-lg p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Nom du chef d'établissement</label>
          <input
            type="text"
            value={form.chef_etablissement_nom || ''}
            onChange={(e) => setForm({ ...form, chef_etablissement_nom: e.target.value })}
            placeholder="Ex: Gueugba Manha Herman"
            className="w-full border rounded-lg p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Titre</label>
          <input
            type="text"
            value={form.chef_etablissement_titre || ''}
            onChange={(e) => setForm({ ...form, chef_etablissement_titre: e.target.value })}
            placeholder="Ex: Directeur Des Études"
            className="w-full border rounded-lg p-2"
          />
        </div>
        <button
          onClick={enregistrerTexte}
          disabled={saving}
          className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
    }
    
