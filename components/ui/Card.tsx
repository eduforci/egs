import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={[
        "bg-white rounded-2xl shadow-xl shadow-chalk/10 border border-chalk/5",
        "p-6 sm:p-8 w-full",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
