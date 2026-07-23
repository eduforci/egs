import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Fait correspondre chaque préfixe de route à un rôle autorisé
const ROLE_ROUTES: Record<string, string> = {
  "/admin": "super_admin",
  "/chef": "chef",
  "/directeur": "directeur_etudes",
  "/comptable": "comptable",
  "/secretariat": "secretaire",
  "/prof": "enseignant",
  "/parent": "parent",
  "/eleve": "eleve",
};

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
  const matchedPrefix = Object.keys(ROLE_ROUTES).find((p) =>
    path.startsWith(p)
  );

  if (matchedPrefix) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, must_change_password")
      .eq("id", user.id)
      .single();

    if (profile?.role !== ROLE_ROUTES[matchedPrefix]) {
      // Connecté, mais mauvais espace : renvoyé vers son propre tableau de bord
      return NextResponse.redirect(new URL("/login", request.url));
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
    "/comptable/:path*",
    "/secretariat/:path*",
    "/prof/:path*",
    "/parent/:path*",
    "/eleve/:path*",
  ],
};

