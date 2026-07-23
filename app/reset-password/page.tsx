"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    // Le lien reçu par email place automatiquement une session
    // "recovery" côté navigateur. On vérifie qu'elle est bien là
    // avant d'autoriser la saisie du nouveau mot de passe.
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) {
        setReady(true);
      } else {
        setLinkInvalid(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setLinkInvalid(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError("Impossible de mettre à jour le mot de passe. Réessayez.");
        return;
      }

      // Si ce compte était en attente de changement obligatoire,
      // ce lien a rempli cette condition aussi.
      await supabase.rpc("mark_password_changed");

      window.location.href = "/";
    } catch {
      setError("Une erreur est survenue. Réessayez dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="font-display text-2xl font-semibold text-chalk">
            Réinitialiser le mot de passe
          </div>
          <p className="text-sm text-chalk/50 mt-1">
            Choisissez un nouveau mot de passe pour votre compte EGS.
          </p>
        </div>

        <Card className="bg-white/70 backdrop-blur-xl">
          {linkInvalid ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-red-600">
                Ce lien de réinitialisation est invalide ou a expiré.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  window.location.href = "/login";
                }}
              >
                Retour à la connexion
              </Button>
            </div>
          ) : !ready ? (
            <p className="text-sm text-chalk/50 text-center py-4">
              Vérification du lien en cours…
            </p>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Input
                label="Nouveau mot de passe"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
              />

              <Input
                label="Confirmer le mot de passe"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Ressaisissez le mot de passe"
              />

              {error && (
                <p role="alert" aria-live="polite" className="text-red-600 text-sm">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading}>
                Valider le nouveau mot de passe
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
