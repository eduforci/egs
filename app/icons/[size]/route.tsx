import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Génère l'icône de l'application : /icons/192 et /icons/512
export async function GET(
  _req: Request,
  { params }: { params: { size: string } }
) {
  const taille = params.size === '512' ? 512 : 192;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B3D2E',
          color: '#C9962B',
          fontSize: Math.round(taille * 0.34),
          fontWeight: 700,
        }}
      >
        EGS
      </div>
    ),
    { width: taille, height: taille }
  );
}
