import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: affectations } = await supabase
    .from("affectations_enseignant")
    .select(`id, classes ( id, nom, niveau, annee_scolaire ), matieres ( id, nom, coefficient_defaut )`)
    .eq("enseignant_id", user?.id);

  return (
    <main className="p-8">
      <h1 className="font-display text-3xl font-semibold mb-1">Mes classes</h1>
      <p className="text-neutral-500 mb-6">{affectations?.length ?? 0} affectation(s) enregistrée(s)</p>

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Classe</th>
              <th className="p-3">Niveau</th>
              <th className="p-3">Matière</th>
              <th className="p-3">Coefficient</th>
              <th className="p-3">Année scolaire</th>
            </tr>
          </thead>
          <tbody>
            {affectations?.map((a: any) => (
              <tr key={a.id} className="border-t hover:bg-neutral-50">
                <td className="p-0" colSpan={5}>
                  <Link
                    href={`/prof/classe/${a.classes?.id}/matiere/${a.matieres?.id}`}
                    className="grid grid-cols-5 p-3 gap-0"
                  >
                    <span>{a.classes?.nom}</span>
                    <span>{a.classes?.niveau}</span>
                    <span>{a.matieres?.nom}</span>
                    <span>{a.matieres?.coefficient_defaut}</span>
                    <span>{a.classes?.annee_scolaire}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!affectations || affectations.length === 0) && (
          <p className="p-4 text-neutral-500 text-sm">
            Aucune classe ne vous a encore été affectée. Contactez votre chef d'établissement.
          </p>
        )}
      </div>
    </main>
  );
}
