export type UserRole =
  | "super_admin"
  | "chef"
  | "directeur_etudes"
  | "comptable"
  | "secretaire"
  | "enseignant"
  | "parent"
  | "eleve";

export interface Profile {
  id: string;
  role: UserRole;
  etablissement_id: string | null;
  nom: string;
  prenom: string;
  telephone: string | null;
  avatar_url: string | null;
  identifiant: string | null;
  must_change_password: boolean;
}

export interface Etablissement {
  id: string;
  nom: string;
  ville: string | null;
  statut: "actif" | "en_attente" | "suspendu" | "expire";
  logo_url: string | null;
  annee_scolaire_active: string | null;
  devise: string | null;
}

export interface EmploiDuTemps {
  id: string;
  classe_id: string;
  matiere_id: string;
  enseignant_id: string | null;
  jour_semaine: number; // 1 = lundi ... 6 = samedi
  heure_debut: string;
  heure_fin: string;
  salle: string | null;
}

export interface Notification {
  id: string;
  etablissement_id: string;
  destinataire_id: string | null;
  destinataire_role: UserRole | null;
  titre: string;
  contenu: string | null;
  emetteur_id: string | null;
  lu: boolean;
  created_at: string;
}

export interface Classe {
  id: string;
  etablissement_id: string;
  nom: string;
  niveau: string;
  annee_scolaire: string;
}

export interface Note {
  id: string;
  eleve_id: string;
  matiere_id: string;
  classe_id: string;
  enseignant_id: string;
  type: "devoir" | "composition" | "interrogation";
  valeur: number;
  coefficient: number;
  trimestre: 1 | 2 | 3;
  annee_scolaire: string;
}

// À compléter au fur et à mesure : Matiere, Absence, Observation,
// EmploiDuTemps, FraisScolarite, Bulletin, CodeInvitation...
