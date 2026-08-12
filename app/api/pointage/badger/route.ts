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

const ROLES_POINTAGE: Record<string, readonly Role[]> = {
  enseignants: ['enseignant'],
  educateurs: ['educateur'],
  direction: ['chef', 'directeur_etudes'],
  administration: ['secretaire', 'comptable', 'caissier'],
};

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
    ROLES_POINTAGE.eleves?.includes(role)
  ) {
    return true;
  }

  return false;
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
          error: 'Vous devez être connecté pour effectuer un pointage.',
        },
        { status: 401 }
      );
    }

    // -------------------------------------------------------------------------
    // DONNÉES REÇUES
    // -------------------------------------------------------------------------

    const body = await request.json();

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

    const { data: profil, error: profilError } =
      await supabase
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

    const role = profil.role as Role;

    // -------------------------------------------------------------------------
    // CONFIGURATION
    // -------------------------------------------------------------------------

    const { data: config, error: configError } =
      await supabase
        .from('pointage_configurations')
        .select(
          'pointage_actif, pointage_enseignants, pointage_educateurs, pointage_direction, pointage_administration, pointage_eleves, tolerance_retard_minutes, tolerance_depart_anticipe_minutes'
        )
        .eq(
          'etablissement_id',
          profil.etablissement_id
        )
        .maybeSingle();

    if (configError) {
      return NextResponse.json(
        {
          error:
            'Impossible de récupérer la configuration du pointage.',
        },
        { status: 500 }
      );
    }

    if (!config || !config.pointage_actif) {
      return NextResponse.json(
        {
          error:
            'Le pointage n’est pas activé dans cet établissement.',
        },
        { status: 403 }
      );
    }

    // -------------------------------------------------------------------------
    // AUTORISATION DU RÔLE
    // -------------------------------------------------------------------------

    if (role === 'super_admin') {
      // Le super administrateur peut effectuer un pointage de test.
    } else if (!roleAutorise(role, config)) {
      return NextResponse.json(
        {
          error:
            'Votre rôle n’est pas autorisé à utiliser le pointage.',
        },
        { status: 403 }
      );
    }

    // -------------------------------------------------------------------------
    // APPAREIL
    // -------------------------------------------------------------------------

    const { data: device, error: deviceError } =
      await supabase
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

    if (deviceError || !device) {
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
    // DATE / HEURE CÔTE D'IVOIRE
    // -------------------------------------------------------------------------

    const maintenant = new Date();

    const dateFormatter = new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Africa/Abidjan',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    );

    const timeFormatter = new Intl.DateTimeFormat(
      'fr-FR',
      {
        timeZone: 'Africa/Abidjan',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }
    );

    const datePointage =
      dateFormatter.format(maintenant);

    const heurePointage =
      timeFormatter.format(maintenant);

    const heureMinute = heurePointage.slice(0, 5);

    // -------------------------------------------------------------------------
    // PÉRIODE ACTIVE
    // -------------------------------------------------------------------------

    const { data: periodes, error: periodeError } =
      await supabase
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
      return NextResponse.json(
        {
          error:
            'Impossible de récupérer les périodes de pointage.',
        },
        { status: 500 }
      );
    }

    const periode = (periodes || []).find(
      (p) =>
        heureMinute >= p.heure_debut.slice(0, 5) &&
        heureMinute <= p.heure_fin.slice(0, 5)
    );

    // -------------------------------------------------------------------------
    // SI AUCUNE PÉRIODE
    // -------------------------------------------------------------------------

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
    // VÉRIFIER SI UN POINTAGE EXISTE DÉJÀ
    // -------------------------------------------------------------------------

    const { data: pointagesExistants } =
      await supabase
        .from('pointages')
        .select(
          'id, type_evenement, heure_pointage, periode_id'
        )
        .eq(
          'profile_id',
          profil.id
        )
        .eq(
          'date_pointage',
          datePointage
        )
        .order('heure_pointage');

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
    // STATUT
    // -------------------------------------------------------------------------

    let statut = 'a_l_heure';

    if (type_evenement === 'arrivee') {
      const debut = periode.heure_debut.slice(0, 5);

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

      if (
        retard >
        config.tolerance_retard_minutes
      ) {
        statut = 'retard';
      }
    } else {
      const fin = periode.heure_fin.slice(0, 5);

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

      if (
        avance >
        config.tolerance_depart_anticipe_minutes
      ) {
        statut = 'depart_anticipe';
      } else {
        statut = 'depart_normal';
      }
    }

    // -------------------------------------------------------------------------
    // ENREGISTREMENT
    // -------------------------------------------------------------------------

    const { data: pointage, error: insertError } =
      await supabase
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
    // METTRE À JOUR LE DERNIER POINTAGE DE L'APPAREIL
    // -------------------------------------------------------------------------

    await supabase
      .from('pointage_devices')
      .update({
        dernier_pointage_at:
          new Date().toISOString(),
      })
      .eq('id', device.id);

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
