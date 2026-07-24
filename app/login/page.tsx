"use client";

import { useState, ReactNode } from "react";
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

function Logo() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <defs>
        <linearGradient id="egsLogoGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="27" fill="url(#egsLogoGradient)" />
      <path
        d="M28 15l16 7-16 7-16-7 16-7z"
        fill="white"
        opacity="0.95"
      />
      <path
        d="M16 24.5v7c0 2.8 5.4 5 12 5s12-2.2 12-5v-7"
        stroke="white"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
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
  const [resetEmailDisplay, setResetEmailDisplay] = useState("");

  const supabase = createClient();

  async function resolveEmail(value: string): Promise<string | null> {
    const trimmed = value.trim();
    if (trimmed.includes("@")) return trimmed;

    const { data, error: resolveError } = await supabase.rpc(
      "resolve_login",
      { p_identifiant: trimmed }
    );

    if (resolveError || !data) return null;
    return data as string;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const resolvedEmail = await resolveEmail(email);

      if (!resolvedEmail) {
        setError("Identifiants incorrects. Vérifiez votre email/identifiant et mot de passe.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
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
      setError("Renseignez votre email ou identifiant ci-dessus avant de continuer.");
      return;
    }

    setLoading(true);
    try {
      const resolvedEmail = await resolveEmail(email);

      if (!resolvedEmail) {
        setError("Aucun compte ne correspond à cet email/identifiant.");
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        resolvedEmail,
        {
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/reset-password`
              : undefined,
        }
      );

      if (resetError) {
        setError(
          `Impossible d'envoyer l'email — détail technique : ${resetError.message} (code: ${resetError.status ?? "?"})`
        );
        return;
      }

      setResetEmailDisplay(resolvedEmail);
      setResetSent(true);
    } catch (err) {
      setError(
        `Erreur inattendue — détail technique : ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4 py-10 relative overflow-hidden">
      {/* Decorative soft blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 bg-blue-300/30 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl" />

      <div className="w-full max-w-md animate-fade-in-up relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="mb-3 drop-shadow-lg">
            <Logo />
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
                  label="Email ou Identifiant"
                  type="text"
                  autoComplete="username"
                  required
                  icon={<MailIcon />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@etablissement.ci ou ENS-0001"
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
                    Un email a été envoyé à <strong>{resetEmailDisplay}</strong>. Suivez le
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
                    label="Email ou Identifiant"
                    type="text"
                    autoComplete="username"
                    required
                    icon={<MailIcon />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@etablissement.ci ou ENS-0001"
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
        
