'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Annonce = {
  id: string;
  titre: string;
  contenu: string;
  classe_nom: string | null;
  created_at: string;
  lu: boolean;
};

export default function MessagerieParentPage() {
  const supabase = createClient();
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [parentId, setParentId] = useState('');

  const charger = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    setParentId(userData.user.id);

    const { data: annoncesData, error } = await supabase
      .from('annonces')
      .select('id, titre, contenu, classe_id, classes(nom), created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setLoading(false);
      return;
    }

    const idsAnnonces = (annoncesData || []).map((a) => a.id);
    const { data: lectures } = idsAnnonces.length > 0
      ? await supabase
          .from('annonces_lectures')
          .select('annonce_id')
          .eq('parent_id', userData.user.id)
          .in('annonce_id', idsAnnonces)
      : { data: [] };

    const luesSet = new Set((lectures || []).map((l) => l.annonce_id));

    setAnnonces(
      (annoncesData || []).map((a: any) => ({
        id: a.id,
        titre: a.titre,
        contenu: a.contenu,
        classe_nom: a.classes?.nom || null,
        created_at: a.created_at,
        lu: luesSet.has(a.id),
      }))
    );

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const marquerLu = async (annonceId: string) => {
    await supabase.from('annonces_lectures').upsert(
      { annonce_id: annonceId, parent_id: parentId },
      { onConflict: 'annonce_id,parent_id' }
    );
    setAnnonces((prev) => prev.map((a) => a.id === annonceId ? { ...a, lu: true } : a));
  };

  if (loading) return <p className="p-4 text-gray-500">Chargement...</p>;

  const nbNonLues = annonces.filter((a) => !a.lu).length;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Messages de l'établissement</h1>
        {nbNonLues > 0 && (
          <p className="text-sm text-orange-600">{nbNonLues} message(s) non lu(s)</p>
        )}
      </div>

      {annonces.length === 0 && (
        <p className="text-gray-500 text-sm">Aucun message pour le moment.</p>
      )}

      <div className="space-y-2">
        {annonces.map((a) => (
          <div
            key={a.id}
            onClick={() => !a.lu && marquerLu(a.id)}
            className={`border rounded-lg p-3 ${!a.lu ? 'bg-blue-50 border-blue-200' : ''}`}
          >
            <div className="flex justify-between items-start">
              <div className="font-medium">{a.titre}</div>
              {!a.lu && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Nouveau</span>}
            </div>
            <p className="text-sm text-gray-600 mt-1">{a.contenu}</p>
            <div className="text-xs text-gray-400 mt-2">
              {a.classe_nom ? `Pour ${a.classe_nom}` : 'Annonce générale'} — {new Date(a.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
       }
