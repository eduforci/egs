"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<string, string> = {
  primary:
    "bg-chalk text-paper hover:bg-chalk-soft focus-visible:ring-chalk",
  secondary:
    "bg-gold text-chalk hover:brightness-95 focus-visible:ring-gold",
  ghost:
    "bg-transparent text-chalk border border-chalk/20 hover:bg-chalk/5 focus-visible:ring-chalk",
};

export default function Button({
  children,
  variant = "primary",
  loading = false,
  fullWidth = true,
  disabled,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5",
        "font-body font-semibold text-sm transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        "active:scale-[0.98]",
        fullWidth ? "w-full" : "",
        VARIANT_CLASSES[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

