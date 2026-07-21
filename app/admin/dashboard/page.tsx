import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const { data: etablissements } = await supabase
    .from("etablissements")
    .select("id, nom, ville, statut")
    .order("created_at", { ascending: false });

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-3xl font-semibold">Établissements</h1>
        <Link
          href="/admin/etablissements/nouveau"
          className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          + Nouvel établissement
        </Link>
      </div>
      <p className="text-neutral-500 mb-6">
        {etablissements?.length ?? 0} établissement(s) enregistré(s)
      </p>

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Ville</th>
              <th className="p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {etablissements?.map((e: any) => (
              <tr key={e.id} className="border-t">
                <td className="p-3">{e.nom}</td>
                <td className="p-3">{e.ville}</td>
                <td className="p-3">{e.statut}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
      }
