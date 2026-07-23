"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

type Mode = "login" | "forgot";

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6.5A2.5 2.5 0 015.5 4h13A2.5 2.5 0 0121 6.5v11A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-11z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 7l7.386 5.34a1 1 0 001.228 0L20 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="10.5"
        width="15"
        height="9.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 10.5V8a4 4 0 118 0v2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M9.9 5.1A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16.3 16.3 0 01-3.2 4.1M6.5 6.9C4 8.8 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.1 0 2.1-.2 3-.5M9.9 9.9a2.75 2.75 0 003.9 3.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("Identifiants incorrects. Vérifiez votre email et mot de passe.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("egs_remember_me", rememberMe ? "1" : "0");
      }

      window.location.href = "/";
    } catch {
      setError("Une erreur est survenue. Réessayez dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError("Renseignez votre email ci-dessus avant de continuer.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/reset-password`
              : undefined,
        }
      );

      if (resetError) {
        setError("Impossible d'envoyer l'email. Vérifiez l'adresse saisie.");
        return;
      }

      setResetSent(true);
    } catch {
      setError("Une erreur est survenue. Réessayez dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-paper via-paper to-chalk/10 px-4 py-10">
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-full border-2 border-gold flex items-center justify-center font-display font-bold text-lg text-gold bg-white shadow-sm mb-3">
            EG
          </div>
          <div className="font-display text-2xl font-semibold text-chalk">
            EGS
          </div>
          <div className="text-xs text-chalk/50 uppercase tracking-wide mt-0.5">
            École Gestion System
          </div>
          <div className="text-xs text-chalk/40 italic mt-1">
            &laquo; La gestion scolaire réinventée &raquo;
          </div>
        </div>

        <Card>
          {mode === "login" ? (
            <>
              <h1 className="font-display text-lg font-semibold text-chalk mb-5 text-center">
                Connexion à votre espace
              </h1>

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  icon={<MailIcon />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@etablissement.ci"
                />

                <Input
                  label="Mot de passe"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  icon={<LockIcon />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-chalk/40 hover:text-chalk p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chalk/30"
                      aria-label={
                        showPassword
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  }
                />

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-chalk/70 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-chalk/30 text-chalk focus:ring-chalk/30"
                    />
                    Se souvenir de moi
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setResetSent(false);
                    }}
                    className="text-chalk/60 hover:text-chalk underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chalk/30 rounded"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

                {error && (
                  <p role="alert" aria-live="polite" className="text-red-600 text-sm">
                    {error}
                  </p>
                )}

                <Button type="submit" loading={loading}>
                  Se connecter
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-lg font-semibold text-chalk mb-2 text-center">
                Mot de passe oublié
              </h1>
              <p className="text-sm text-chalk/60 mb-5 text-center">
                Saisissez votre email, nous vous enverrons un lien de
                réinitialisation.
              </p>

              {resetSent ? (
                <div className="text-center space-y-4">
                  <p className="text-sm text-chalk bg-chalk/5 rounded-xl p-4">
                    Un email a été envoyé à <strong>{email}</strong>. Suivez le
                    lien qu'il contient pour choisir un nouveau mot de passe.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMode("login");
                      setResetSent(false);
                    }}
                  >
                    Retour à la connexion
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} noValidate className="space-y-4">
                  <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    required
                    icon={<MailIcon />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@etablissement.ci"
                  />

                  {error && (
                    <p role="alert" aria-live="polite" className="text-red-600 text-sm">
                      {error}
                    </p>
                  )}

                  <Button type="submit" loading={loading}>
                    Envoyer le lien
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                  >
                    Annuler
                  </Button>
                </form>
              )}
            </>
          )}
        </Card>

        <p className="text-center text-xs text-chalk/40 mt-6">
          Version 1.0 · © EGS
        </p>
      </div>
    </div>
  );
    }
      
