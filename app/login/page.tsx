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

const ROLES: { label: string; icon: ReactNode }[] = [
  {
    label: "Super Administrateur",
    icon: (
      <path d="M12 3l7 3v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
    ),
  },
  {
    label: "Chef d'établissement",
    icon: (
      <path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6M4 21h16" />
    ),
  },
  {
    label: "Directeur des études",
    icon: (
      <path d="M4 5.5A2.5 2.5 0 016.5 3H12v18H6.5A2.5 2.5 0 014 18.5v-13zM20 5.5A2.5 2.5 0 0017.5 3H12v18h5.5a2.5 2.5 0 002.5-2.5v-13z" />
    ),
  },
  {
    label: "Comptable",
    icon: (
      <path d="M5 3.5h14v17H5v-17zM8 7.5h8M8 11h3M13 11h3M8 14.5h3M13 14.5h3" />
    ),
  },
  {
    label: "Secrétaire",
    icon: (
      <path d="M8 3h8l1 3H7l1-3zM6 6h12v15H6V6zM9 10h6M9 13.5h6M9 17h4" />
    ),
  },
  {
    label: "Enseignant",
    icon: (
      <path d="M2 9l10-5 10 5-10 5-10-5zM6 11.5v5c0 1.4 2.7 3 6 3s6-1.6 6-3v-5M22 9v6" />
    ),
  },
  {
    label: "Parent",
    icon: (
      <path d="M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM16 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6M10.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6" />
    ),
  },
  {
    label: "Élève",
    icon: (
      <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3zM5.5 9.5V15c0 2 3 3.5 6.5 3.5s6.5-1.5 6.5-3.5V9.5" />
    ),
  },
];

function RoleIcon({ path }: { path: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
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

        {/* Rôles — purement décoratif, aucune interaction sur la connexion */}
        <div
          className="mt-8"
          aria-hidden="true"
        >
          <p className="text-center text-xs font-semibold text-chalk/40 uppercase tracking-wide mb-3">
            Un espace pour chaque acteur de l&apos;établissement
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {ROLES.map((role) => (
              <div
                key={role.label}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/60 py-3 px-1.5 text-center shadow-sm shadow-blue-900/5 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="text-blue-600">
                  <RoleIcon path={role.icon} />
                </span>
                <span className="text-[10px] leading-tight text-chalk/60 font-medium">
                  {role.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-chalk/40 mt-6">
          Version 1.0 · © EGS
        </p>
      </div>
    </div>
  );
    }
