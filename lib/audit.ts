// Enregistre une ligne dans le journal d'audit.
// Ne bloque jamais l'opération d'origine : en cas d'erreur, on ne fait que l'écrire dans les logs.

type EntreeJournal = {
  etablissementId: string | null | undefined;
  acteurId: string | null | undefined;
  action: string;
  cibleType?: string;
  cibleId?: string;
  cibleLibelle?: string;
  details?: Record<string, unknown>;
};

export async function journaliser(admin: any, e: EntreeJournal): Promise<void> {
  try {
    if (!e.etablissementId) return;

    let acteurNom: string | null = null;
    let acteurRole: string | null = null;

    if (e.acteurId) {
      const { data: acteur } = await admin
        .from("profiles")
        .select("nom, prenom, role")
        .eq("id", e.acteurId)
        .maybeSingle();
      if (acteur) {
        acteurNom = `${acteur.prenom ?? ""} ${acteur.nom ?? ""}`.trim() || null;
        acteurRole = acteur.role ?? null;
      }
    }

    await admin.from("journal_audit").insert({
      etablissement_id: e.etablissementId,
      acteur_id: e.acteurId ?? null,
      acteur_nom: acteurNom,
      acteur_role: acteurRole,
      action: e.action,
      cible_type: e.cibleType ?? null,
      cible_id: e.cibleId ?? null,
      cible_libelle: e.cibleLibelle ?? null,
      details: e.details ?? null,
    });
  } catch (err) {
    console.error("Journal d'audit :", err);
  }
}
