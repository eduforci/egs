-- ============================================================
-- EGS — Schéma Supabase (PostgreSQL)
-- 5 espaces : super_admin, chef, enseignant, parent, eleve
-- À exécuter dans Supabase → SQL Editor
-- ============================================================

-- ---------- 1. RÔLES ----------
create type user_role as enum ('super_admin', 'chef', 'enseignant', 'parent', 'eleve');
create type statut_abonnement as enum ('actif', 'en_attente', 'suspendu', 'expire');
create type type_evaluation as enum ('devoir', 'composition', 'interrogation');

-- ---------- 2. ÉTABLISSEMENTS ----------
create table etablissements (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  ville text,
  adresse text,
  telephone text,
  logo_url text,
  statut statut_abonnement not null default 'en_attente',
  date_debut_abonnement date,
  date_fin_abonnement date,
  created_at timestamptz not null default now()
);

-- ---------- 3. PROFILS (étend auth.users de Supabase) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  etablissement_id uuid references etablissements(id) on delete cascade,
  nom text not null,
  prenom text not null,
  telephone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------- 4. CLASSES ----------
create table classes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  nom text not null,               -- ex: "3ème A"
  niveau text not null,             -- ex: "3ème"
  annee_scolaire text not null,     -- ex: "2025-2026"
  created_at timestamptz not null default now()
);

-- ---------- 5. MATIÈRES ----------
create table matieres (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  nom text not null,                -- ex: "Mathématiques"
  coefficient_defaut numeric not null default 1
);

-- ---------- 6. AFFECTATIONS ENSEIGNANT ↔ MATIÈRE ↔ CLASSE ----------
create table affectations_enseignant (
  id uuid primary key default gen_random_uuid(),
  enseignant_id uuid not null references profiles(id) on delete cascade,
  matiere_id uuid not null references matieres(id) on delete cascade,
  classe_id uuid not null references classes(id) on delete cascade,
  unique (enseignant_id, matiere_id, classe_id)
);

-- ---------- 7. CODES D'INVITATION (enseignants) ----------
create table codes_invitation (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  code text not null unique,
  matiere_id uuid references matieres(id),
  classe_id uuid references classes(id),
  expires_at timestamptz not null,
  used_by uuid references profiles(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- 8. ÉLÈVES ----------
create table eleves (
  id uuid primary key references profiles(id) on delete cascade,
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  classe_id uuid not null references classes(id),
  matricule text not null,
  date_naissance date,
  unique (etablissement_id, matricule)
);

-- ---------- 9. LIEN PARENT ↔ ÉLÈVE (fratrie possible) ----------
create table parents_eleves (
  parent_id uuid not null references profiles(id) on delete cascade,
  eleve_id uuid not null references eleves(id) on delete cascade,
  primary key (parent_id, eleve_id)
);

-- ---------- 10. NOTES ----------
create table notes (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  matiere_id uuid not null references matieres(id) on delete cascade,
  classe_id uuid not null references classes(id) on delete cascade,
  enseignant_id uuid not null references profiles(id),
  type type_evaluation not null,
  valeur numeric not null check (valeur >= 0 and valeur <= 20),
  coefficient numeric not null default 1,
  trimestre int not null check (trimestre in (1,2,3)),
  annee_scolaire text not null,
  created_at timestamptz not null default now()
);

-- ---------- 11. ABSENCES ----------
create table absences (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  classe_id uuid not null references classes(id),
  matiere_id uuid references matieres(id),
  enseignant_id uuid references profiles(id),
  date date not null,
  heure_debut time,
  heure_fin time,
  justifie boolean not null default false,
  motif text,
  created_at timestamptz not null default now()
);

-- ---------- 12. OBSERVATIONS (appréciations enseignants) ----------
create table observations (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  enseignant_id uuid not null references profiles(id),
  matiere_id uuid references matieres(id),
  texte text not null,
  trimestre int not null check (trimestre in (1,2,3)),
  annee_scolaire text not null,
  created_at timestamptz not null default now()
);

-- ---------- 13. EMPLOI DU TEMPS ----------
create table emplois_du_temps (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references classes(id) on delete cascade,
  matiere_id uuid not null references matieres(id),
  enseignant_id uuid references profiles(id),
  jour_semaine int not null check (jour_semaine between 1 and 6), -- 1=lundi
  heure_debut time not null,
  heure_fin time not null,
  salle text
);

-- ---------- 14. FRAIS DE SCOLARITÉ ----------
create table frais_scolarite (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  annee_scolaire text not null,
  montant_total numeric not null,
  montant_paye numeric not null default 0,
  date_echeance date
);

-- ---------- 15. BULLETINS (snapshot validé, PDF) ----------
create table bulletins (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  trimestre int not null check (trimestre in (1,2,3)),
  annee_scolaire text not null,
  moyenne_generale numeric,
  pdf_url text,
  valide_par uuid references profiles(id),
  valide_at timestamptz,
  unique (eleve_id, trimestre, annee_scolaire)
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Fonctions utilitaires : lisent le rôle / établissement de l'utilisateur connecté
create or replace function my_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function my_etablissement() returns uuid as $$
  select etablissement_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Active RLS sur toutes les tables sensibles
alter table etablissements enable row level security;
alter table profiles enable row level security;
alter table classes enable row level security;
alter table matieres enable row level security;
alter table affectations_enseignant enable row level security;
alter table codes_invitation enable row level security;
alter table eleves enable row level security;
alter table parents_eleves enable row level security;
alter table notes enable row level security;
alter table absences enable row level security;
alter table observations enable row level security;
alter table emplois_du_temps enable row level security;
alter table frais_scolarite enable row level security;
alter table bulletins enable row level security;

-- Super admin : accès total (exemple sur etablissements, à dupliquer par table)
create policy "super_admin_full_access" on etablissements
  for all using (my_role() = 'super_admin');

-- Chef d'établissement : accès à son propre établissement
create policy "chef_own_etablissement" on etablissements
  for select using (my_role() = 'chef' and id = my_etablissement());

-- Profils : chacun voit son propre profil ; chef/admin voient ceux de leur établissement
create policy "profiles_self" on profiles
  for select using (id = auth.uid());
create policy "profiles_chef_scope" on profiles
  for select using (my_role() = 'chef' and etablissement_id = my_etablissement());
create policy "profiles_admin_scope" on profiles
  for all using (my_role() = 'super_admin');

-- Classes / matières : visibles par tous les membres du même établissement
create policy "classes_same_etablissement" on classes
  for select using (etablissement_id = my_etablissement() or my_role() = 'super_admin');
create policy "matieres_same_etablissement" on matieres
  for select using (etablissement_id = my_etablissement() or my_role() = 'super_admin');

-- Notes : enseignant crée/modifie ses propres saisies ;
-- élève voit les siennes ; parent voit celles de ses enfants
create policy "notes_enseignant_write" on notes
  for all using (enseignant_id = auth.uid());
create policy "notes_eleve_read" on notes
  for select using (eleve_id = auth.uid());
create policy "notes_parent_read" on notes
  for select using (
    exists (select 1 from parents_eleves pe where pe.parent_id = auth.uid() and pe.eleve_id = notes.eleve_id)
  );

-- Absences : même logique que les notes
create policy "absences_enseignant_write" on absences
  for all using (enseignant_id = auth.uid());
create policy "absences_eleve_read" on absences
  for select using (eleve_id = auth.uid());
create policy "absences_parent_read" on absences
  for select using (
    exists (select 1 from parents_eleves pe where pe.parent_id = auth.uid() and pe.eleve_id = absences.eleve_id)
  );

-- Frais de scolarité : uniquement chef d'établissement + le parent concerné
create policy "frais_chef_scope" on frais_scolarite
  for all using (
    exists (select 1 from eleves e where e.id = frais_scolarite.eleve_id and e.etablissement_id = my_etablissement())
    and my_role() = 'chef'
  );
create policy "frais_parent_read" on frais_scolarite
  for select using (
    exists (select 1 from parents_eleves pe where pe.parent_id = auth.uid() and pe.eleve_id = frais_scolarite.eleve_id)
  );

-- NOTE : ceci couvre les politiques essentielles pour valider l'architecture.
-- Chaque table restante (observations, emplois_du_temps, bulletins, codes_invitation,
-- affectations_enseignant, parents_eleves, eleves) suit le même principe :
-- scoper par etablissement_id via my_etablissement(), ou par lien direct
-- (auth.uid() = eleve_id / enseignant_id / parent_id). On les complètera au fur
-- et à mesure du développement de chaque module, comme pour EDUFORCI.
