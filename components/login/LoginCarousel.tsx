"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { useLangue } from "@/lib/i18n/provider";

// ✏️ À MODIFIER : vos vrais tarifs
const PLANS = [
  { name: "Essentiel", desc: "Jusqu'à 200 élèves", price: "25 000 F", hot: false },
  { name: "Établissement ★", desc: "Jusqu'à 600 élèves · tous les espaces", price: "50 000 F", hot: true },
  { name: "Premium", desc: "Élèves illimités · multi-sites", price: "90 000 F", hot: false },
];

// ✏️ À MODIFIER : vos vrais espaces
const SPACES = [
  { icon: "🏛️", name: "Direction", desc: "Pilotage, statistiques, validation" },
  { icon: "🧑‍🏫", name: "Enseignants", desc: "Notes, absences, cahier de textes" },
  { icon: "👨‍👩‍👧", name: "Parents", desc: "Bulletins, paiements, messages" },
  { icon: "🎒", name: "Élèves", desc: "Emploi du temps, devoirs, résultats" },
];

const FEATURES = [
  { icon: "📝", text: "Saisie des notes et bulletins automatiques" },
  { icon: "🗓️", text: "Emplois du temps et suivi des présences" },
  { icon: "💳", text: "Suivi des paiements et reçus en un clic" },
  { icon: "💬", text: "Messages et annonces aux parents" },
  { icon: "📊", text: "Tableaux de bord en temps réel" },
];

function Row({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className="flex-none w-7 h-7 rounded-lg bg-blue-50 grid place-items-center text-sm">
        {icon}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

export default function LoginCarousel() {
  const { t } = useLangue();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const x0 = useRef<number | null>(null);

  const slides: ReactNode[] = [
    // 1. Présentation
    <div key="intro">
      <div className="text-3xl mb-2">🏫</div>
      <h2 className="font-display text-lg font-semibold text-chalk mb-1">
        {t("Toute votre école, au même endroit")}
      </h2>
      <p className="text-sm text-chalk/60 mb-3">
        {t("Scolarité, pédagogie, comptabilité et communication réunies dans une seule plateforme, accessible depuis votre téléphone.")}
      </p>
      <ul className="space-y-2">
        <Row icon="⚡">{t("Moins de papier, plus de temps pour les élèves")}</Row>
        <Row icon="📱">{t("Utilisable partout, même avec une connexion limitée")}</Row>
        <Row icon="🔒">{t("Données sécurisées et sauvegardées")}</Row>
      </ul>
    </div>,

    // 2. Espaces
    <div key="spaces">
      <div className="text-3xl mb-2">👥</div>
      <h2 className="font-display text-lg font-semibold text-chalk mb-1">
        {t("Un espace pour chacun")}
      </h2>
      <p className="text-sm text-chalk/60 mb-3">
        {t("Chaque profil retrouve uniquement ce qui le concerne.")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SPACES.map((s) => (
          <div key={s.name} className="bg-blue-50 rounded-2xl p-2.5 text-xs leading-snug">
            <b className="block text-sm text-chalk mb-0.5">
              {s.icon} {t(s.name)}
            </b>
            <span className="text-chalk/70">{t(s.desc)}</span>
          </div>
        ))}
        <div className="col-span-2 bg-blue-50 rounded-2xl p-2.5 text-xs leading-snug">
          <b className="block text-sm text-chalk mb-0.5">💼 {t("Secrétariat & Comptabilité")}</b>
          <span className="text-chalk/70">{t("Inscriptions, scolarités, reçus, dépenses")}</span>
        </div>
      </div>
    </div>,

    // 3. Fonctionnalités
    <div key="features">
      <div className="text-3xl mb-2">✨</div>
      <h2 className="font-display text-lg font-semibold text-chalk mb-3">
        {t("Ce que vous pouvez faire")}
      </h2>
      <ul className="space-y-2.5">
        {FEATURES.map((f) => (
          <Row key={f.text} icon={f.icon}>{t(f.text)}</Row>
        ))}
      </ul>
    </div>,

    // 4. Tarifs
    <div key="pricing">
      <div className="text-3xl mb-2">💰</div>
      <h2 className="font-display text-lg font-semibold text-chalk mb-3">
        {t("Tarifs d'abonnement")}
      </h2>
      <div className="space-y-2">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={
              "flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 " +
              (p.hot ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white" : "bg-blue-50 text-chalk")
            }
          >
            <div>
              <b className="text-sm block">{t(p.name)}</b>
              <span className={"text-xs " + (p.hot ? "text-blue-100" : "text-chalk/60")}>{t(p.desc)}</span>
            </div>
            <div className="font-display text-base whitespace-nowrap">
              {p.price}
              <span className="text-xs font-sans opacity-70">/{t("mois")}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-chalk/50 mt-2">
        {t("Tarifs indicatifs en FCFA. Réduction pour paiement annuel.")}
      </p>
    </div>,

    // 5. Contact / démo
    <div key="contact">
      <div className="text-3xl mb-2">🤝</div>
      <h2 className="font-display text-lg font-semibold text-chalk mb-1">
        {t("Découvrez EGS en démo")}
      </h2>
      <p className="text-sm text-chalk/60 mb-3">
        {t("Mise en place, import de vos données et formation de votre personnel : nous vous accompagnons.")}
      </p>
      <ul className="space-y-2.5">
        <Row icon="💬">
          WhatsApp :{" "}
          <a href="https://wa.me/2250575516214" className="underline underline-offset-2 font-medium">
            05 75 51 62 14
          </a>
        </Row>
        <Row icon="📞">
          {t("Téléphone :")}{" "}
          <a href="tel:+2250153109586" className="underline underline-offset-2 font-medium">
            01 53 10 95 86
          </a>
        </Row>
      </ul>
    </div>,
  ];

  const n = slides.length;

  // Défilement automatique (désactivé si l'utilisateur préfère moins d'animations)
  useEffect(() => {
    if (paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((v) => (v + 1) % n), 5000);
    return () => clearInterval(id);
  }, [paused, n]);

  function onTouchStart(e: React.TouchEvent) {
    x0.current = e.touches[0].clientX;
    setPaused(true);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (x0.current !== null) {
      const d = e.changedTouches[0].clientX - x0.current;
      if (Math.abs(d) > 40) setI((v) => (v + (d < 0 ? 1 : -1) + n) % n);
      x0.current = null;
    }
    setPaused(false);
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Présentation d'EGS"
      className="mb-5 rounded-3xl bg-white/70 backdrop-blur border border-white/60 shadow-lg shadow-blue-500/10 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${i * 100}%)` }}
        aria-live={paused ? "polite" : "off"}
      >
        {slides.map((s, k) => (
          <div
            key={k}
            className="min-w-full p-5 min-h-[300px]"
            aria-hidden={k !== i}
            aria-roledescription="slide"
          >
            {s}
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-1.5 pb-4">
        {slides.map((_, k) => (
          <button
            key={k}
            type="button"
            aria-label={`Page ${k + 1}`}
            onClick={() => setI(k)}
            className={
              "h-2 rounded-full transition-all " +
              (k === i ? "w-5 bg-blue-600" : "w-2 bg-blue-200")
            }
          />
        ))}
      </div>
    </section>
  );
}
