'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/avatar';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super administrateur',
  administration: 'Administration',
  chef: "Chef d'établissement",
  directeur_etudes: 'Directeur des études',
  comptable: 'Comptable',
  caissier: 'Caissier',
  secretaire: 'Secrétaire',
  educateur: 'Éducateur',
  enseignant: 'Enseignant',
  parent: 'Parent',
  eleve: 'Élève',
};

const FONCTIONS = [
  'Directeur',
  'Directrice',
  'Directeur des études',
  "Chef d'établissement",
  'Proviseur',
  'Principal',
  'Censeur',
  'Surveillant général',
  'Fondateur',
  'Promoteur',
  'Économe',
  'Secrétaire général',
];

// Réduit la photo (400 px, JPEG) avant l'envoi : léger même avec une connexion lente.
async function reduireImage(fichier: File, max = 400): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' } as any);
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * ratio);
  const hauteur = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Impossible de préparer l'image.");
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Impossible de préparer l'image."))), 'image/jpeg', 0.85)
  );
}

async function appelerApi(corps: Record<string, any>) {
  const res = await fetch('/api/profil', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Impossible d'enregistrer.");
}

export default function ProfilForm() {
  const [supabase] = useState(() => createClient());
  const entree = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [fonction, setFonction] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [role, setRole] = useState('');
  const [aCompleter, setACompleter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const estEleve = role === 'eleve';
  const estParent = role === 'parent';
  const afficheFonction = !estEleve && !estParent;

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Non authentifié.');
        setUserId(user.id);

        const { data: profil, error } = await supabase
          .from('profiles')
          .select('nom, prenom, telephone, identifiant, role')
          .eq('id', user.id)
          .single();
        if (error) throw new Error(error.message);

        const nomVide = !profil.nom || profil.nom.trim().toLowerCase() === 'à renseigner';
        const prenomVide = !profil.prenom || profil.prenom.trim().toLowerCase() === 'à renseigner';
        setACompleter(nomVide || prenomVide);
        setNom(nomVide ? '' : profil.nom);
        setPrenom(prenomVide ? '' : profil.prenom);
        setTelephone(profil.telephone || '');
        setIdentifiant(profil.identifiant || '');
        setRole(profil.role || '');

        // Colonnes ajoutées récemment : lues à part pour ne pas bloquer le reste
        const { data: extra } = await supabase
          .from('profiles')
          .select('fonction, avatar_url')
          .eq('id', user.id)
          .single();
        setFonction((extra as any)?.fonction || '');
        setAvatarUrl((extra as any)?.avatar_url || null);
      } catch (e: any) {
        setErreur(e?.message || 'Erreur de chargement.');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  async function choisirPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier || !userId) return;
    setErreur(null);
    setSucces(null);
    if (!fichier.type.startsWith('image/')) {
      setErreur('Choisissez une image (JPG, PNG ou WebP).');
      return;
    }
    setPhotoEnCours(true);
    try {
      const blob = await reduireImage(fichier);
      const chemin = `${userId}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(chemin, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
      if (upErr) throw new Error(upErr.message);

      const { data } = supabase.storage.from('avatars').getPublicUrl(chemin);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      await appelerApi({ avatar_url: url });
      setAvatarUrl(url);
      setSucces('Photo enregistrée.');
    } catch (err: any) {
      setErreur(err?.message || "Impossible d'enregistrer la photo.");
    } finally {
      setPhotoEnCours(false);
    }
  }

  async function retirerPhoto() {
    if (!userId) return;
    setErreur(null);
    setSucces(null);
    setPhotoEnCours(true);
    try {
      await appelerApi({ avatar_url: null });
      await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
      setAvatarUrl(null);
      setSucces('Photo retirée.');
    } catch (err: any) {
      setErreur(err?.message || 'Impossible de retirer la photo.');
    } finally {
      setPhotoEnCours(false);
    }
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    if (!nom.trim() || !prenom.trim()) {
      setErreur('Le nom et le prénom sont obligatoires.');
      return;
    }
    setSaving(true);
    try {
      const corps: Record<string, any> = { nom, prenom, telephone };
      if (afficheFonction) corps.fonction = fonction;
      await appelerApi(corps);
      setACompleter(false);
      setSucces('Profil enregistré. Le menu se mettra à jour au prochain affichage.');
    } catch (err: any) {
      setErreur(err?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Chargement...</p>;

  return (
    <main className="p-4 md:p-6 max-w-lg mx-auto pb-16">
      <h1 className="text-xl font-bold mb-1">Mon profil</h1>
      <p className="text-sm text-gray-500 mb-4">
        {ROLE_LABELS[role] || role}
        {identifiant ? ` · Identifiant ${identifiant}` : ''}
      </p>

      {aCompleter && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md p-3 mb-4">
          Votre nom ou votre prénom n'a pas encore été renseigné. Merci de les compléter.
        </div>
      )}
      {erreur && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-md p-3 mb-4">{erreur}</div>
      )}
      {succes && (
        <div className="bg-green-50 border border-green-300 text-green-700 text-sm rounded-md p-3 mb-4">{succes}</div>
      )}

      {/* PHOTO */}
      <div className="flex items-center gap-4 mb-6">
        <div className="[&>*]:!bg-gray-200 [&>*]:!text-gray-600">
          <Avatar url={avatarUrl} prenom={prenom} nom={nom} taille={80} />
        </div>
        <div className="space-y-2">
          <input
            ref={entree}
            type="file"
            accept="image/*"
            onChange={choisirPhoto}
            className="hidden"
          />
          <button
            type="button"
            disabled={photoEnCours}
            onClick={() => entree.current?.click()}
            className="block border rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          >
            {photoEnCours ? 'Envoi...' : avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
          </button>
          {avatarUrl && !photoEnCours && (
            <button type="button" onClick={retirerPhoto} className="text-xs text-red-600 underline">
              Retirer la photo
            </button>
          )}
        </div>
      </div>

      <form onSubmit={enregistrer} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Nom {!estEleve && '*'}</label>
            <input
              type="text"
              value={nom}
              disabled={estEleve}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border rounded-lg p-2 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prénom {!estEleve && '*'}</label>
            <input
              type="text"
              value={prenom}
              disabled={estEleve}
              onChange={(e) => setPrenom(e.target.value)}
              className="w-full border rounded-lg p-2 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
        </div>

        {estEleve && (
          <p className="text-xs text-gray-500">
            Votre nom et votre prénom sont ceux de votre dossier officiel. Pour les corriger, adressez-vous à
            l'administration de l'école.
          </p>
        )}

        {!estEleve && (
          <div>
            <label className="block text-sm font-medium mb-1">Téléphone</label>
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full border rounded-lg p-2"
            />
          </div>
        )}

        {afficheFonction && (
          <div>
            <label className="block text-sm font-medium mb-1">Fonction (titre affiché)</label>
            <input
              type="text"
              list="fonctions"
              value={fonction}
              onChange={(e) => setFonction(e.target.value)}
              placeholder="Ex. Directeur, Censeur, Promoteur..."
              className="w-full border rounded-lg p-2"
            />
            <datalist id="fonctions">
              {FONCTIONS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <p className="text-xs text-gray-500 mt-1">
              Ce titre s'affiche sous votre nom dans le menu. S'il est vide, le nom du rôle est affiché.
            </p>
          </div>
        )}

        {!estEleve && (
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gray-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        )}
      </form>
    </main>
  );
}
