import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={[
        "bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl shadow-blue-900/10",
        "border border-white/60",
        "p-6 sm:p-8 w-full",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
