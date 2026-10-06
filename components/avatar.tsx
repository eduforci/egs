'use client';

// Photo de profil ronde, ou initiales si aucune photo.
export default function Avatar({
  url,
  prenom,
  nom,
  taille = 32,
}: {
  url?: string | null;
  prenom?: string;
  nom?: string;
  taille?: number;
}) {
  const initiales = `${(prenom || '').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase();
  const style = { width: taille, height: taille };

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        style={style}
        className="rounded-full object-cover bg-neutral-700 shrink-0"
      />
    );
  }

  return (
    <div
      style={{ ...style, fontSize: Math.max(10, Math.round(taille / 2.8)) }}
      className="rounded-full bg-neutral-700 text-white flex items-center justify-center font-medium shrink-0"
    >
      {initiales || '?'}
    </div>
  );
}
