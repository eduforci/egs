"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function ChangerMotDePassePage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

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

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", user.id);
      }

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
            Nouveau mot de passe
          </div>
          <p className="text-sm text-chalk/50 mt-1">
            Pour la sécurité de votre compte, choisissez un mot de passe
            personnel avant de continuer.
          </p>
        </div>

        <Card className="bg-white/70 backdrop-blur-xl">
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
              Valider et continuer
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
      }
