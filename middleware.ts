import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Fait correspondre chaque préfixe de route à un rôle autorisé
const ROLE_ROUTES: Record<string, string> = {
  "/admin": "super_admin",
  "/chef": "chef",
  "/directeur": "directeur_etudes",
  "/directeur-etudes": "directeur_etudes",
  "/direction": "directeur_etudes",
  "/comptable": "comptable",
  "/secretariat": "secretaire",
  "/prof": "enseignant",
  "/enseignant": "enseignant",
  "/parent": "parent",
  "/eleve": "eleve",
  "/educateur": "educateur",
};

// Tableau de bord propre à chaque rôle, utilisé quand un utilisateur connecté
// tente d'accéder à un espace qui n'est pas le sien
const DASHBOARD_PAR_ROLE: Record<string, string> = {
  super_admin: "/admin/dashboard",
  chef: "/chef/dashboard",
  directeur_etudes: "/directeur/dashboard",
  administration: "/directeur/dashboard",
  comptable: "/comptable/dashboard",
  secretaire: "/secretariat/dashboard",
  enseignant: "/prof/dashboard",
  parent: "/parent/dashboard",
  eleve: "/eleve/dashboard",
  educateur: "/educateur/dashboard",
};

// Exceptions : chemins normalement reserves a un role, mais accessibles aussi a d'autres roles
const EXCEPTIONS: { prefix: string; rolesSupplementaires: string[] }[] = [
  { prefix: "/chef/bulletins", rolesSupplementaires: ["directeur_etudes"] },
  { prefix: "/chef/comptabilite", rolesSupplementaires: ["comptable", "directeur_etudes"] },
  { prefix: "/chef/classes", rolesSupplementaires: ["directeur_etudes"] },
  { prefix: "/chef/personnel", rolesSupplementaires: ["directeur_etudes"] },
  { prefix: "/chef/eleves", rolesSupplementaires: ["directeur_etudes"] },
  { prefix: "/chef/examens", rolesSupplementaires: ["directeur_etudes"] },
  { prefix: "/chef/enseignants", rolesSupplementaires: ["directeur_etudes"] },
  { prefix: "/chef/parents", rolesSupplementaires: ["directeur_etudes"] },
  { prefix: "/direction", rolesSupplementaires: ["chef"] },
  // DESPS, AGFNE, établissement : le chef les consulte (lecture seule)
  { prefix: "/directeur-etudes", rolesSupplementaires: ["chef"] },
];

// Le compte « administration » est le compte principal de l'école : il accède à tous
// les espaces de gestion de l'école (pas aux espaces personnels enseignant, parent, élève
// ni à l'espace super admin).
const ESPACES_ADMINISTRATION = [
  "/chef",
  "/directeur",
  "/directeur-etudes",
  "/direction",
  "/comptable",
  "/secretariat",
  "/educateur",
];

// Trouve l'espace correspondant à l'adresse, en comparant des segments entiers
// (« /admin » ne doit pas attraper « /administration »).
function espaceCorrespondant(path: string): string | undefined {
  return Object.keys(ROLE_ROUTES)
    .filter((p) => path === p || path.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, any>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const matchedPrefix = espaceCorrespondant(path);

  if (matchedPrefix) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, must_change_password")
      .eq("id", user.id)
      .single();

    const roleRequis = ROLE_ROUTES[matchedPrefix];
    const exception = EXCEPTIONS.find((ex) => path.startsWith(ex.prefix));
    const rolesAutorises = exception
      ? [roleRequis, ...exception.rolesSupplementaires]
      : [roleRequis];

    const accesAdministration =
      profile?.role === "administration" && ESPACES_ADMINISTRATION.includes(matchedPrefix);

    if (!profile?.role || (!rolesAutorises.includes(profile.role) && !accesAdministration)) {
      // Connecté, mais mauvais espace : renvoyé vers son propre tableau de bord
      const dashboard = profile?.role ? DASHBOARD_PAR_ROLE[profile.role] : undefined;
      return NextResponse.redirect(new URL(dashboard || "/login", request.url));
    }

    if (profile?.must_change_password) {
      return NextResponse.redirect(
        new URL("/changer-mot-de-passe", request.url)
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/chef/:path*",
    "/directeur/:path*",
    "/directeur-etudes/:path*",
    "/direction/:path*",
    "/comptable/:path*",
    "/secretariat/:path*",
    "/prof/:path*",
    "/enseignant/:path*",
    "/parent/:path*",
    "/eleve/:path*",
    "/educateur/:path*",
  ],
};
