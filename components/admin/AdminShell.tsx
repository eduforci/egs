"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4M9 6h.01M9 10h.01M9 14h.01M15 6h.01M15 10h.01M15 14h.01" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconScroll({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M9 3h9v14a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 0-3-3" />
      <path d="M9 3a3 3 0 0 0-3 3" />
      <path d="M13 8h4M13 12h4" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: "Tableau de bord",
    items: [{ label: "Vue d'ensemble", href: "/admin", icon: IconDashboard }],
  },
  {
    title: "Plateforme",
    items: [
      { label: "Établissements", href: "/admin/etablissements", icon: IconBuilding },
      { label: "Utilisateurs", href: "/admin/utilisateurs", icon: IconUsers },
      { label: "Abonnements", href: "/admin/abonnements", icon: IconCard },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Journaux d'activité", href: "/admin/journaux", icon: IconScroll },
      { label: "Paramètres", href: "/admin/parametres", icon: IconSettings },
    ],
  },
];

export function AdminShell({
  children,
  fullName,
  roleLabel,
  anneeScolaire,
}: {
  children: React.ReactNode;
  fullName: string;
  roleLabel: string;
  anneeScolaire: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#F6F3EC]">
      {/* SIDEBAR - DESKTOP */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#0B3D2E] lg:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* SIDEBAR - MOBILE DRAWER */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#0B3D2E]">
            <div className="flex justify-end p-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-[#EFE6C8] hover:bg-white/10"
                aria-label="Fermer le menu"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* COLONNE PRINCIPALE */}
      <div className="lg:pl-64">
        {/* TOPBAR */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E7E2D6] bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[#1C1B18] hover:bg-[#F1EEE4] lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-2 sm:gap-4">
            {anneeScolaire && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-[#E7E2D6] bg-white px-3 py-1.5 text-sm font-medium text-[#1C1B18] sm:flex">
                <span>{anneeScolaire}</span>
                <IconChevronDown className="h-3.5 w-3.5 text-[#8A8272]" />
              </div>
            )}

            <button
              className="relative rounded-lg p-2 text-[#6B6459] hover:bg-[#F1EEE4]"
              aria-label="Notifications"
            >
              <IconBell className="h-5 w-5" />
            </button>

            <button
              className="relative rounded-lg p-2 text-[#6B6459] hover:bg-[#F1EEE4]"
              aria-label="Messages"
            >
              <IconMail className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5 border-l border-[#E7E2D6] pl-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0B3D2E] text-xs font-semibold text-[#EFE6C8]">
                {initials || "U"}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight text-[#1C1B18]">
                  {fullName}
                </p>
                <p className="text-xs leading-tight text-[#8A8272]">{roleLabel}</p>
              </div>
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* LOGO / SCEAU */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#C9962B] bg-[#0B3D2E] text-sm font-bold text-[#C9962B]">
          EGS
        </div>
        <div>
          <p className="font-display text-sm font-semibold leading-tight text-white">
            École Gestion System
          </p>
          <p className="text-xs leading-tight text-[#9FB8AC]">by EDUFORCI</p>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-6">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-[#6E9284]">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));

                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-[#C9962B]/15 text-[#F2D695]"
                        : "text-[#D7E4DD] hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* PIED */}
      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[11px] text-[#6E9284]">EGS v2.5.0 — Powered by EDUFORCI</p>
      </div>
    </>
  );
                                  }
