import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function mettreAJourPlateforme(formData: FormData) {
  "use server";

  const supabase = await createClient();

  await supabase
    .from("parametres_plateforme")
    .update({
      nom_plateforme: formData.get("nom_plateforme") as string,
      email_support: (formData.get("email_support") as string) || null,
      telephone_support: (formData.get("telephone_support") as string) || null,
      adresse: (formData.get("adresse") as string) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  revalidatePath("/admin/parametres");
}

async function mettreAJourProfil(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("profiles")
    .update({
      prenom: formData.get("prenom") as string,
      nom: formData.get("nom") as string,
      telephone: (formData.get("telephone") as string) || null,
    })
    .eq("id", user.id);

  revalidatePath("/admin/parametres");
}

async function changerMotDePasse(formData: FormData) {
  "use server";

  const nouveauMotDePasse = formData.get("nouveau_mot_de_passe") as string;
  const confirmation = formData.get("confirmation") as string;

  if (!nouveauMotDePasse || nouveauMotDePasse.length < 8) {
    throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
  }

  if (nouveauMotDePasse !== confirmation) {
    throw new Error("Les mots de passe ne correspondent pas.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: nouveauMotDePasse,
  });

  if (error) throw new Error(error.message);
}

export default async function Parametres() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: parametres }, { data: profil }] = await Promise.all([
    supabase.from("parametres_plateforme").select("*").eq("id", true).maybeSingle(),
    supabase
      .from("profiles")
      .select("prenom, nom, telephone")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);

  const inputClass =
    "w-full rounded-xl border border-[#E7E2D6] px-3 py-2.5 text-sm focus:border-[#0B3D2E] focus:outline-none focus:ring-1 focus:ring-[#0B3D2E]";
  const labelClass = "mb-1.5 block text-sm font-medium text-[#1C1B18]";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="mb-2">
          <p className="mb-1 text-sm font-medium text-[#0B3D2E]">
            Tableau de bord / Paramètres
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
            Paramètres
          </h1>
        </header>

        {/* RÉGLAGES PLATEFORME */}
        <form
          action={mettreAJourPlateforme}
          className="space-y-5 rounded-2xl border border-[#E7E2D6] bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="font-semibold text-[#1C1B18]">Plateforme</h2>
            <p className="mt-1 text-xs text-[#8A8272]">
              Informations générales visibles par les établissements.
            </p>
          </div>

          <div>
            <label className={labelClass}>Nom de la plateforme</label>
            <input
              type="text"
              name="nom_plateforme"
              defaultValue={parametres?.nom_plateforme ?? "EGS"}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Email support</label>
            <input
              type="email"
              name="email_support"
              defaultValue={parametres?.email_support ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Téléphone support</label>
            <input
              type="text"
              name="telephone_support"
              defaultValue={parametres?.telephone_support ?? ""}
              placeholder="+225XXXXXXXXXX"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Adresse</label>
            <input
              type="text"
              name="adresse"
              defaultValue={parametres?.adresse ?? ""}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#082C21]"
            >
              Enregistrer
            </button>
          </div>
        </form>

        {/* PROFIL */}
        <form
          action={mettreAJourProfil}
          className="space-y-5 rounded-2xl border border-[#E7E2D6] bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="font-semibold text-[#1C1B18]">Mon profil</h2>
            <p className="mt-1 text-xs text-[#8A8272]">
              Vos informations personnelles de super administrateur.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Prénom</label>
              <input
                type="text"
                name="prenom"
                defaultValue={profil?.prenom ?? ""}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Nom</label>
              <input
                type="text"
                name="nom"
                defaultValue={profil?.nom ?? ""}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Téléphone</label>
            <input
              type="text"
              name="telephone"
              defaultValue={profil?.telephone ?? ""}
              placeholder="+225XXXXXXXXXX"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#082C21]"
            >
              Enregistrer
            </button>
          </div>
        </form>

        {/* MOT DE PASSE */}
        <form
          action={changerMotDePasse}
          className="space-y-5 rounded-2xl border border-[#E7E2D6] bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="font-semibold text-[#1C1B18]">Mot de passe</h2>
            <p className="mt-1 text-xs text-[#8A8272]">
              Minimum 8 caractères.
            </p>
          </div>

          <div>
            <label className={labelClass}>Nouveau mot de passe</label>
            <input
              type="password"
              name="nouveau_mot_de_passe"
              minLength={8}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Confirmer le mot de passe</label>
            <input
              type="password"
              name="confirmation"
              minLength={8}
              required
              className={inputClass}
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#082C21]"
            >
              Changer le mot de passe
            </button>
          </div>
        </form>
      </div>
    </div>
  );
        }
