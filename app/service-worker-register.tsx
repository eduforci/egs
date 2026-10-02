'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { viderCache } from '@/lib/offline/appel-store';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // l'application fonctionne normalement même sans service worker
      });
    }

    // Sur la page de connexion, personne n'est connecté :
    // on efface les classes et élèves gardés pour le hors ligne.
    if (window.location.pathname === '/login') {
      viderCache();
    }

    // À chaque déconnexion, même chose.
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') viderCache();
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
