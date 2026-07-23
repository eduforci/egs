"use client";

import { InputHTMLAttributes, ReactNode, forwardRef, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
  rightElement?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, icon, error, rightElement, id, className = "", ...rest },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="block text-sm font-semibold text-chalk mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-chalk/40"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={[
            "w-full rounded-xl border bg-white/80 py-2.5 text-sm text-chalk",
            "placeholder:text-chalk/30 transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-chalk/30 focus:border-chalk",
            icon ? "pl-10" : "pl-3",
            rightElement ? "pr-10" : "pr-3",
            error ? "border-red-400" : "border-chalk/15",
            className,
          ].join(" ")}
          {...rest}
        />
        {rightElement && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2">
            {rightElement}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
