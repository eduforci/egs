export type UserRole = "super_admin" | "chef" | "enseignant" | "parent" | "eleve";

export interface Profile {
  id: string;
  role: UserRole;
  etablissement_id: string | null;
  nom: string;
  prenom: string;
  telephone: string | null;
  avatar_url: string | null;
}

export interface Etablissement {
  id: string;
  nom: string;
  ville: string | null;
  statut: "actif" | "en_attente" | "suspendu" | "expire";
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
