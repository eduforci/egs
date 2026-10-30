'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLangue } from '@/lib/i18n/provider';

export default function MenuUtilisateur({ parametresHref }: { parametresHref: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLangue();

  const deconnecter = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1">
      <Link
        href={parametresHref}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100"
        aria-label={t('Paramètres')}
      >
        <span>⚙️</span>
        <span className="hidden sm:inline">{t('Paramètres')}</span>
      </Link>
      <button
        onClick={deconnecter}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50"
        aria-label={t('Déconnexion')}
      >
        <span>🚪</span>
        <span className="hidden sm:inline">{t('Déconnexion')}</span>
      </button>
    </div>
  );
}