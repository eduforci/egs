import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

type Role =
  | 'super_admin'
  | 'chef'
  | 'enseignant'
  | 'parent'
  | 'eleve'
  | 'directeur_etudes'
  | 'comptable'
  | 'secretaire'
  | 'educateur'
  | 'caissier';

const ROLES_POINTAGE = {
  enseignants: ['enseignant'],
  educateurs: ['educateur'],
  direction: ['chef', 'directeur_etudes'],
  administration: ['secretaire', 'comptable', 'caissier'],
  eleves: ['eleve'],
} satisfies Record<string, Role[]>;

function heureEnMinutes(heure: string) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function maintenantLocalCoteIvoire() {
  const maintenant = new Date();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Abidjan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(maintenant);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    heure: `${get('hour')}:${get('minute')}:${get('second')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function roleAutorise(
  role: Role,
  config: {
    pointage_enseignants: boolean;
    pointage_educateurs: boolean;
    pointage_direction: boolean;
    pointage_administration: boolean;
    pointage_eleves: boolean;
  }
) {
  if (
    config.pointage_enseignants &&
    ROLES_POINTAGE.enseignants.includes(role)
  ) {
    return true;
  }

  if (
    config.pointage_educateurs &&
    ROLES_POINTAGE.educateurs.includes(role)
  ) {
    return true;
  }

  if (
    config.pointage_direction &&
    ROLES_POINTAGE.direction.includes(role)
  ) {
    return true;
  }

  if (
    config.pointage_administration &&
    ROLES_POINTAGE.administration.includes(role)
  ) {
    return true;
  }

  if (
    config.pointage_eleves &&
    ROLES_POINTAGE.eleves.includes(role)
  ) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();

    // 1. Vérifier l'utilisateur connecté
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié.' },
        { status: 401 }
      );
    }

    // 2. Lire les données envoyées par l'écran de badgeage
    const body = await request.json();

    const deviceId = body?.device_id;
    const codeDevice = body?.code_device;
    const typeEvenement = body?.type_evenement;

    if (!deviceId || !codeDevice) {
      return NextResponse.json(
        { error: 'Appareil de pointage non renseigné.' },
        { status: 400 }
      );
    }

    if (
      typeEvenement !== 'arrivee' &&
      typeEvenement !== 'depart'
    ) {
      return NextResponse.json(
        { error: 'Type de pointage invalide.' },
        { status: 400 }
      );
    }

    // 3. Récupérer le profil
    const { data: profil, error: profilError } = await supabase
      .from('profiles')
      .select('id, role, etablissement_id, nom, prenom')
      .eq('id', user.id)
      .single();

    if (profilError || !profil) {
      return NextResponse.json(
        { error: 'Profil utilisateur introuvable.' },
        { status: 404 }
      );
    }

    if (!profil.etablissement_id) {
      return NextResponse.json(
        { error: 'Aucun établissement associé à votre compte.' },
        { status: 403 }
      );
    }

    // 4. Récupérer la configuration du pointage
    const { data: config, error: configError } = await supabase
      .from('pointage_configurations')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .maybeSingle();

    if (configError) {
      return NextResponse.json(
        { error: 'Impossible de vérifier la configuration du pointage.' },
        { status: 500 }
      );
    }

    if (!config?.pointage_actif) {
      return NextResponse.json(
        { error: 'Le pointage est actuellement désactivé.' },
        { status: 403 }
      );
    }

    // 5. Vérifier le rôle
    if (
      !roleAutorise(
        profil.role as Role,
        config
      )
    ) {
      return NextResponse.json(
        { error: 'Votre rôle n’est pas soumis au pointage.' },
        { status: 403 }
      );
    }

    // 6. Vérifier l'appareil
    const { data: device, error: deviceError } = await supabase
      .from('pointage_devices')
      .select('*')
      .eq('id', deviceId)
      .eq('etablissement_id', profil.etablissement_id)
      .eq('code_device', codeDevice)
      .eq('actif', true)
      .single();

    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Appareil de pointage non autorisé.' },
        { status: 403 }
      );
    }

    // 7. Heure officielle de Côte d'Ivoire
    const maintenant = maintenantLocalCoteIvoire();

    const datePointage = maintenant.date;
    const heurePointage = maintenant.heure;
    const minutesActuelles = maintenant.minutes;

    // 8. Trouver la période actuelle
    const { data: periodes, error: periodesError } = await supabase
      .from('pointage_periodes')
      .select('*')
      .eq('etablissement_id', profil.etablissement_id)
      .eq('actif', true)
      .order('ordre');

    if (periodesError) {
      return NextResponse.json(
        { error: 'Impossible de récupérer les périodes.' },
        { status: 500 }
      );
    }

    const periode = periodes?.find((p) => {
      const debut = heureEnMinutes(p.heure_debut);
      const fin = heureEnMinutes(p.heure_fin);

      return (
        minutesActuelles >= debut &&
        minutesActuelles <= fin
      );
    });

    if (!periode) {
      return NextResponse.json(
        {
          error:
            'Aucune période de pointage active à cette heure.',
        },
        { status: 400 }
      );
    }

    // 9. Déterminer le statut
    const debutPeriode = heureEnMinutes(periode.heure_debut);
    const finPeriode = heureEnMinutes(periode.heure_fin);

    let statut = 'normal';

    if (typeEvenement === 'arrivee') {
      const retard =
        minutesActuelles -
        debutPeriode;

      if (retard > config.tolerance_retard_minutes) {
        statut = 'retard';
      } else {
        statut = 'a_l_heure';
      }
    }

    if (typeEvenement === 'depart') {
      const avance =
        finPeriode -
        minutesActuelles;

      if (
        avance >
        config.tolerance_depart_anticipe_minutes
      ) {
        statut = 'depart_anticipe';
      } else {
        statut = 'depart_normal';
      }
    }

    // 10. Empêcher les doublons
    const { data: pointageExistant } = await supabase
      .from('pointages')
      .select('id, heure_pointage, type_evenement, statut')
      .eq('profile_id', profil.id)
      .eq('date_pointage', datePointage)
      .eq('periode_id', periode.id)
      .eq('type_evenement', typeEvenement)
      .maybeSingle();

    if (pointageExistant) {
      return NextResponse.json(
        {
          error: 'Vous avez déjà effectué ce pointage pour cette période.',
          pointage: pointageExistant,
        },
        { status: 409 }
      );
    }

    // 11. Enregistrer le pointage
    const { data: pointage, error: insertError } = await supabase
      .from('pointages')
      .insert({
        etablissement_id: profil.etablissement_id,
        profile_id: profil.id,
        periode_id: periode.id,
        device_id: device.id,
        date_pointage: datePointage,
        heure_pointage: heurePointage,
        type_evenement: typeEvenement,
        methode: 'appareil_ecole',
        statut,
        commentaire: null,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          error: 'Impossible d’enregistrer le pointage.',
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    // 12. Mettre à jour le dernier pointage de l'appareil
    await supabase
      .from('pointage_devices')
      .update({
        dernier_pointage_at: new Date().toISOString(),
      })
      .eq('id', device.id);

    // 13. Réponse
    return NextResponse.json({
      success: true,
      message:
        typeEvenement === 'arrivee'
          ? 'Arrivée enregistrée avec succès.'
          : 'Départ enregistré avec succès.',
      pointage: {
        id: pointage.id,
        nom: profil.nom,
        prenom: profil.prenom,
        date: datePointage,
        heure: heurePointage,
        periode: periode.libelle,
        statut,
        appareil: device.nom,
      },
    });
  } catch (error) {
    console.error('Erreur API pointage:', error);

    return NextResponse.json(
      {
        error: 'Une erreur interne est survenue.',
      },
      { status: 500 }
    );
  }
}
