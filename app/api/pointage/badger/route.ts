import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

type RolePointagePersonnel =
  | 'chef'
  | 'enseignant'
  | 'educateur'
  | 'directeur_etudes'
  | 'comptable'
  | 'secretaire'
  | 'caissier';

type ConfigurationPointage = {
  pointage_actif: boolean;
  pointage_enseignants: boolean;
  pointage_educateurs: boolean;
  pointage_direction: boolean;
  pointage_administration: boolean;
  pointage_eleves: boolean;
  tolerance_retard_minutes: number;
  tolerance_depart_anticipe_minutes: number;
  ouverture_anticipee_minutes: number;
};

const ROLES_POINTAGE: {
  enseignants: RolePointagePersonnel[];
  educateurs: RolePointagePersonnel[];
  direction: RolePointagePersonnel[];
  administration: RolePointagePersonnel[];
} = {
  enseignants: ['enseignant'],
  educateurs: ['educateur'],
  direction: ['chef', 'directeur_etudes'],
  administration: [
    'secretaire',
    'comptable',
    'caissier',
  ],
};

function includesRole(
  liste: RolePointagePersonnel[],
  role: RolePointagePersonnel
): boolean {
  return (liste as string[]).includes(role);
}

function roleAutorise(
  role: RolePointagePersonnel,
  config: ConfigurationPointage
): boolean {
  if (
    config.pointage_enseignants &&
    includesRole(ROLES_POINTAGE.enseignants, role)
  ) {
    return true;
  }

  if (
    config.pointage_educateurs &&
    includesRole(ROLES_POINTAGE.educateurs, role)
  ) {
    return true;
  }

  if (
    config.pointage_direction &&
    includesRole(ROLES_POINTAGE.direction, role)
  ) {
    return true;
  }

  if (
    config.pointage_administration &&
    includesRole(ROLES_POINTAGE.administration, role)
  ) {
    return true;
  }

  return false;
}

function estRoleValide(role: string): role is Role {
  return [
    'super_admin',
    'chef',
    'enseignant',
    'parent',
    'eleve',
    'directeur_etudes',
    'comptable',
    'secretaire',
    'educateur',
    'caissier',
  ].includes(role);
}

function estRolePointagePersonnel(
  role: Role
): role is RolePointagePersonnel {
  return (
    role === 'chef' ||
    role === 'enseignant' ||
    role === 'educateur' ||
    role === 'directeur_etudes' ||
    role === 'comptable' ||
    role === 'secretaire' ||
    role === 'caissier'
  );
}

function heureMoinsMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number);
  let total = h * 60 + m - minutes;
  if (total < 0) total = 0;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // -------------------------------------------------------------------------
    // UTILISATEUR CONNECTÉ
    // -------------------------------------------------------------------------

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            'Vous devez être connecté pour effectuer un pointage.',
        },
        { status: 401 }
      );
    }

    // -------------------------------------------------------------------------
    // DONNÉES REÇUES
    // -------------------------------------------------------------------------

    let body: {
      device_id?: string;
      code_device?: string;
      type_evenement?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Les données envoyées sont invalides.',
        },
        { status: 400 }
      );
    }

    const {
      device_id,
      code_device,
      type_evenement,
    } = body;

    if (!device_id || !code_device) {
      return NextResponse.json(
        {
          error: 'Appareil de pointage non identifié.',
        },
        { status: 400 }
      );
    }

    if (
      type_evenement !== 'arrivee' &&
      type_evenement !== 'depart'
    ) {
      return NextResponse.json(
        {
          error: 'Type de pointage invalide.',
        },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // PROFIL
    // -------------------------------------------------------------------------

    const {
      data: profil,
      error: profilError,
    } = await supabase
      .from('profiles')
      .select(
        'id, nom, prenom, role, etablissement_id'
      )
      .eq('id', user.id)
      .single();

    if (profilError || !profil) {
      return NextResponse.json(
        {
          error: 'Profil utilisateur introuvable.',
        },
        { status: 404 }
      );
    }

    if (!profil.etablissement_id) {
      return NextResponse.json(
        {
          error:
            'Votre compte n’est associé à aucun établissement.',
        },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // VALIDATION DU RÔLE
    // -------------------------------------------------------------------------

    if (!estRoleValide(profil.role)) {
      return NextResponse.json(
        {
          error:
            'Le rôle associé à votre compte est invalide.',
        },
        { status: 403 }
      );
    }

    const role: Role = profil.role;

    // -------------------------------------------------------------------------
    // CONFIGURATION
    // -------------------------------------------------------------------------

    const {
      data: config,
      error: configError,
    } = await supabase
      .from('pointage_configurations')
      .select(
        'pointage_actif, pointage_enseignants, pointage_educateurs, pointage_direction, pointage_administration, pointage_eleves, tolerance_retard_minutes, tolerance_depart_anticipe_minutes, ouverture_anticipee_minutes'
      )
      .eq(
        'etablissement_id',
        profil.etablissement_id
      )
      .maybeSingle();

    if (configError) {
      console.error(
        'Erreur récupération configuration:',
        configError
      );

      return NextResponse.json(
        {
          error:
            'Impossible de récupérer la configuration du pointage.',
        },
        { status: 500 }
      );
    }

    if (!config) {
      return NextResponse.json(
        {
          error:
            'Aucune configuration de pointage n’a été créée pour cet établissement.',
        },
        { status: 403 }
      );
    }

    if (!config.pointage_actif) {
      return NextResponse.json(
        {
          error:
            'Le pointage n’est pas activé dans cet établissement.',
        },
        { status: 403 }
      );
    }

    // -------------------------------------------------------------------------
    // AUTORISATION DU PERSONNEL
    // -------------------------------------------------------------------------

    if (role === 'super_admin') {
      return NextResponse.json(
        {
          error:
            'Le super administrateur ne fait pas partie du personnel pointé.',
        },
        { status: 403 }
      );
    }

    if (role === 'parent') {
      return NextResponse.json(
        {
          error:
            'Les parents ne sont pas concernés par le pointage du personnel.',
        },
        { status: 403 }
      );
    }

    if (role === 'eleve') {
      return NextResponse.json(
        {
          error:
            'Le pointage des élèves utilise le système de présence scolaire.',
        },
        { status: 403 }
      );
    }

    if (!estRolePointagePersonnel(role)) {
      return NextResponse.json(
        {
          error:
            'Votre rôle n’est pas autorisé à utiliser le pointage du personnel.',
        },
        { status: 403 }
      );
    }

    if (!roleAutorise(role, config)) {
      return NextResponse.json(
        {
          error:
            'Votre rôle n’est pas autorisé à utiliser le pointage dans cet établissement.',
        },
        { status: 403 }
      );
    }

    // -------------------------------------------------------------------------
    // APPAREIL
    // -------------------------------------------------------------------------

    const {
      data: device,
      error: deviceError,
    } = await supabase
      .from('pointage_devices')
      .select(
        'id, nom, description, code_device, actif, etablissement_id'
      )
      .eq('id', device_id)
      .eq(
        'etablissement_id',
        profil.etablissement_id
      )
      .eq('actif', true)
      .maybeSingle();

    if (deviceError) {
      console.error(
        'Erreur récupération appareil:',
        deviceError
      );

      return NextResponse.json(
        {
          error:
            'Impossible de vérifier l’appareil de pointage.',
        },
        { status: 500 }
      );
    }

    if (!device) {
      return NextResponse.json(
        {
          error:
            'Cet appareil n’est pas autorisé pour votre établissement.',
        },
        { status: 403 }
      );
    }

    if (device.code_device !== code_device) {
      return NextResponse.json(
        {
          error:
            'Le code de l’appareil est incorrect.',
        },
        { status: 403 }
      );
    }

    // -------------------------------------------------------------------------
    // DATE / HEURE — CÔTE D'IVOIRE
    // -------------------------------------------------------------------------

    const maintenant = new Date();

    const dateFormatter =
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Abidjan',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

    const timeFormatter =
      new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Africa/Abidjan',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

    const datePointage =
      dateFormatter.format(maintenant);

    const heurePointage =
      timeFormatter.format(maintenant);

    const heureMinute =
      heurePointage.slice(0, 5);

    // -------------------------------------------------------------------------
    // PÉRIODE ACTIVE
    // -------------------------------------------------------------------------

    const {
      data: periodes,
      error: periodeError,
    } = await supabase
      .from('pointage_periodes')
      .select(
        'id, libelle, heure_debut, heure_fin, ordre'
      )
      .eq(
        'etablissement_id',
        profil.etablissement_id
      )
      .eq('actif', true)
      .order('ordre');

    if (periodeError) {
      console.error(
        'Erreur récupération périodes:',
        periodeError
      );

      return NextResponse.json(
        {
          error:
            'Impossible de récupérer les périodes de pointage.',
        },
        { status: 500 }
      );
    }

    const periode = (periodes || []).find((p) => {
      const debutAnticipe = heureMoinsMinutes(
        p.heure_debut.slice(0, 5),
        config.ouverture_anticipee_minutes
      );
      return (
        heureMinute >= debutAnticipe &&
        heureMinute <= p.heure_fin.slice(0, 5)
      );
    });

    if (!periode) {
      return NextResponse.json(
        {
          error:
            'Aucune période de pointage n’est actuellement ouverte.',
        },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // VÉRIFICATION DES POINTAGES EXISTANTS
    // -------------------------------------------------------------------------

    const {
      data: pointagesExistants,
      error: pointagesError,
    } = await supabase
      .from('pointages')
      .select(
        'id, type_evenement, heure_pointage, periode_id'
      )
      .eq('profile_id', profil.id)
      .eq('date_pointage', datePointage)
      .order('heure_pointage');

    if (pointagesError) {
      console.error(
        'Erreur récupération pointages:',
        pointagesError
      );

      return NextResponse.json(
        {
          error:
            'Impossible de vérifier vos pointages précédents.',
        },
        { status: 500 }
      );
    }

    const dernierArrivee =
      pointagesExistants?.find(
        (p) =>
          p.type_evenement === 'arrivee'
      );

    const dernierDepart =
      pointagesExistants?.find(
        (p) =>
          p.type_evenement === 'depart'
      );

    if (
      type_evenement === 'arrivee' &&
      dernierArrivee
    ) {
      return NextResponse.json(
        {
          error:
            'Votre arrivée a déjà été enregistrée aujourd’hui.',
        },
        { status: 409 }
      );
    }

    if (
      type_evenement === 'depart' &&
      dernierDepart
    ) {
      return NextResponse.json(
        {
          error:
            'Votre départ a déjà été enregistré aujourd’hui.',
        },
        { status: 409 }
      );
    }

    // -------------------------------------------------------------------------
    // CALCUL DU STATUT
    // -------------------------------------------------------------------------

    let statut:
      | 'a_l_heure'
      | 'retard'
      | 'depart_normal'
      | 'depart_anticipe';

    if (type_evenement === 'arrivee') {
      const debut =
        periode.heure_debut.slice(0, 5);

      const [hDebut, mDebut] =
        debut.split(':').map(Number);

      const [hNow, mNow] =
        heureMinute.split(':').map(Number);

      const minutesDebut =
        hDebut * 60 + mDebut;

      const minutesNow =
        hNow * 60 + mNow;

      const retard =
        minutesNow - minutesDebut;

      statut =
        retard >
        config.tolerance_retard_minutes
          ? 'retard'
          : 'a_l_heure';
    } else {
      const fin =
        periode.heure_fin.slice(0, 5);

      const [hFin, mFin] =
        fin.split(':').map(Number);

      const [hNow, mNow] =
        heureMinute.split(':').map(Number);

      const minutesFin =
        hFin * 60 + mFin;

      const minutesNow =
        hNow * 60 + mNow;

      const avance =
        minutesFin - minutesNow;

      statut =
        avance >
        config.tolerance_depart_anticipe_minutes
          ? 'depart_anticipe'
          : 'depart_normal';
    }

    // -------------------------------------------------------------------------
    // ENREGISTREMENT
    // -------------------------------------------------------------------------

    const {
      data: pointage,
      error: insertError,
    } = await supabase
      .from('pointages')
      .insert({
        etablissement_id:
          profil.etablissement_id,
        profile_id: profil.id,
        periode_id: periode.id,
        device_id: device.id,
        date_pointage: datePointage,
        heure_pointage: heurePointage,
        type_evenement,
        methode: 'appareil',
        statut,
      })
      .select()
      .single();

    if (insertError) {
      console.error(
        'Erreur insertion pointage:',
        insertError
      );

      return NextResponse.json(
        {
          error:
            'Impossible d’enregistrer le pointage.',
        },
        { status: 500 }
      );
    }

    // -------------------------------------------------------------------------
    // MISE À JOUR DE L'APPAREIL
    // -------------------------------------------------------------------------

    const {
      error: deviceUpdateError,
    } = await supabase
      .from('pointage_devices')
      .update({
        dernier_pointage_at:
          new Date().toISOString(),
      })
      .eq('id', device.id);

    if (deviceUpdateError) {
      console.error(
        'Erreur mise à jour appareil:',
        deviceUpdateError
      );
    }

    // -------------------------------------------------------------------------
    // RÉPONSE
    // -------------------------------------------------------------------------

    return NextResponse.json({
      success: true,

      message:
        type_evenement === 'arrivee'
          ? statut === 'retard'
            ? 'Arrivée enregistrée avec retard.'
            : 'Arrivée enregistrée à l’heure.'
          : statut === 'depart_anticipe'
          ? 'Départ enregistré : départ anticipé.'
          : 'Départ enregistré avec succès.',

      pointage: {
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
    console.error(
      'Erreur API pointage:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Une erreur interne est survenue.',
      },
      { status: 500 }
    );
  }
        }
