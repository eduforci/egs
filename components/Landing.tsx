"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./landing.css";

// ====== À PERSONNALISER ======
const WHATSAPP = "2250575516214"; // numéro WhatsApp de ta page de connexion (05 75 51 62 14), format international sans +
const APP_URL = "/login"; // page de connexion actuelle d'EGS
// =============================

type Plan = {
  n: string;
  s: string;
  old: number;
  now: number;
  xNow: number;
  xOld: number;
  hot?: boolean;
  f: string[];
};

const PLANS: Plan[] = [
  { n: "Starter", s: "Jusqu'à 300 élèves", old: 520, now: 415, xNow: 245000, xOld: 305000,
    f: ["Élèves et classes", "Notes et relevés", "Présences", "Enseignants", "Administration de base", "Sauvegarde / export", "Rapports standards", "Portail parents"] },
  { n: "Professional", s: "Jusqu'à 600 élèves", old: 765, now: 610, xNow: 355000, xOld: 450000,
    f: ["Tout Starter", "Paie", "Finances scolaires", "Comptes utilisateurs", "Rôles et accès avancés", "Journal des connexions", "Bulletins professionnels", "Notifications"] },
  { n: "Premium", s: "Jusqu'à 1 200 élèves", old: 1140, now: 910, xNow: 535000, xOld: 670000, hot: true,
    f: ["Tout Professional", "Application mobile / PWA", "Paiement des frais scolaires", "Email / Telegram", "Bulletins sécurisés QR", "Tableau de bord direction", "Analytics", "Examens", "Emploi du temps", "Documents numériques"] },
  { n: "Business", s: "Jusqu'à 2 500 élèves", old: 1910, now: 1530, xNow: 895000, xOld: 1120000,
    f: ["Tout Premium", "Multi-départements", "RH avancées", "Admissions", "Bibliothèque", "Transport scolaire", "Cantine", "Inventaire", "API", "Sauvegarde cloud", "Support prioritaire"] },
  { n: "Enterprise", s: "Jusqu'à 5 000 élèves", old: 2600, now: 2080, xNow: 1220000, xOld: 1525000,
    f: ["Tout Business", "Multi-campus / multi-écoles", "Domaine personnalisé", "Personnalisation de marque", "API complète", "Intégrations comptables et paiement", "Analytics avancées", "SLA / support dédié", "Hébergement dédié possible"] },
];

const EDU_USD = 190;
const EDU_XOF = 110000;

const XOF: Record<string, string> = {
  CI: "Côte d'Ivoire 🇨🇮", SN: "Sénégal 🇸🇳", ML: "Mali 🇲🇱", BF: "Burkina Faso 🇧🇫",
  BJ: "Bénin 🇧🇯", TG: "Togo 🇹🇬", NE: "Niger 🇳🇪", GW: "Guinée-Bissau 🇬🇼",
};
const OTHERS: Record<string, string> = {
  CM: "Cameroun 🇨🇲", GA: "Gabon 🇬🇦", CD: "RD Congo 🇨🇩", GN: "Guinée 🇬🇳",
  NG: "Nigeria 🇳🇬", GH: "Ghana 🇬🇭", KE: "Kenya 🇰🇪", MA: "Maroc 🇲🇦", FR: "France 🇫🇷",
};
const ALL = { ...XOF, ...OTHERS };

const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");

export default function Landing() {
  const [code, setCode] = useState("CI");
  const [auto, setAuto] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("egs_country");
    if (saved) {
      setCode(saved);
      return;
    }
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((j) => {
        if (j?.country_code) {
          setCode(j.country_code);
          setAuto(true);
        }
      })
      .catch(() => {});
  }, []);

  const isXOF = code in XOF;
  const name = (ALL as Record<string, string>)[code] ?? "International";

  function onDemo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const text =
      `Demande de démo EGS\nÉcole : ${d.get("ecole")}\nNom : ${d.get("nom")}\n` +
      `Tél : ${d.get("tel")}\nMessage : ${d.get("msg") ?? ""}`;
    window.location.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div className="egs">
      <header className="egs-header">
        <div className="egs-logo">
          <i>🎓</i>
          <span>EGS<small>École Gestion System</small></span>
        </div>
        <div className="egs-actions">
          <Link className="egs-btn gold" href={APP_URL}>Se connecter</Link>
          <a className="egs-btn" href="#demo">Démo</a>
        </div>
      </header>

      <main className="egs-wrap">
        <div className="egs-country">
          <div>🌍 EGS · La gestion scolaire réinventée</div>
          <div>
            <b>{name}</b> {auto && <small>📍 détecté automatiquement</small>}
          </div>
          <div>
            Monnaie : <b>{isXOF ? "XOF" : "USD"}</b>{" "}
            {picking ? (
              <select
                className="egs-select"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setAuto(false);
                  setPicking(false);
                  localStorage.setItem("egs_country", e.target.value);
                }}
              >
                {Object.entries(ALL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            ) : (
              <button className="egs-link" onClick={() => setPicking(true)}>Changer de pays</button>
            )}
          </div>
        </div>

        <span className="egs-badge">🌍 Vision panafricaine</span>
        <h1>L'infrastructure numérique pour les <span>systèmes éducatifs africains.</span></h1>
        <p className="egs-lead">
          Un moteur académique conçu pour respecter les réalités des établissements francophones et
          anglophones — puis s'adapter progressivement aux systèmes éducatifs de toute l'Afrique.
        </p>

        <div className="egs-cta">
          <a className="egs-btn gold" href="#demo">Demander une démo →</a>
          <a className="egs-btn" href="#plateforme">Découvrir la plateforme</a>
          <Link className="egs-btn" href={APP_URL}>🔐 Se connecter à mon espace</Link>
          <a className="egs-btn" href="#comment">❓ Comment ça marche</a>
        </div>
        <div className="egs-hero" aria-hidden="true">🎓</div>

        <section id="plateforme">
          <div className="egs-kicker">LA PLATEFORME</div>
          <h2>Un seul moteur. Des expériences adaptées.</h2>
          <p className="egs-lead">
            EGS centralise l'académique, la vie scolaire, les finances, les RH et la
            communication, tout en laissant le modèle pédagogique s'adapter au pays, au cycle, au
            niveau et à la filière.
          </p>
          <div className="egs-grid c3">
            {[
              ["🎓", "Académique", "Élèves, classes, matières, évaluations, notes, compétences et bulletins."],
              ["📊", "Pilotage", "Tableaux de bord et rapports pour transformer les données scolaires en décisions."],
              ["🏫", "Multi-école", "Une architecture conçue pour évoluer d'un établissement à un réseau scolaire."],
              ["🔐", "Sécurité", "Rôles, permissions et séparation des données au cœur de l'expérience."],
            ].map(([ic, t, p]) => (
              <div className="egs-feat" key={t}>
                <div className="ic">{ic}</div>
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="comment">
          <div className="egs-kicker">COMMENT ÇA MARCHE</div>
          <h2>De l'inscription à la première connexion.</h2>
          <div className="egs-grid c2">
            {[
              ["1", "Inscription de l'école", "Vous demandez une démo, puis votre école s'inscrit."],
              ["2", "Remise du code d'accès", "Après l'inscription, nous envoyons son code d'accès au responsable de l'école."],
              ["3", "L'école s'organise", "Le responsable ouvre son espace et configure son établissement comme il le souhaite."],
              ["4", "Chacun se connecte", "Enseignants, parents, élèves et personnel se connectent avec leurs propres identifiants."],
            ].map(([n, t, p]) => (
              <div className="egs-feat" key={n}>
                <div className="ic">{n}</div>
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
          <Link className="egs-btn gold" href={APP_URL}>Se connecter →</Link>
        </section>

        <section id="tarifs">
          <div className="egs-kicker">TARIFS</div>
          <h2>Des offres selon la taille de votre école.</h2>
          <div className="egs-grid c2">
            {PLANS.map((p) => (
              <article className={`egs-plan${p.hot ? " hot" : ""}`} key={p.n}>
                <h3>{p.n}</h3>
                <div className="sub">{p.s}</div>
                <div className="egs-old">{fmt(p.old)} $ / an</div>
                <div className="egs-price">
                  <b>{fmt(p.now)} $</b><em>1re année</em><span className="egs-off">−20 %</span>
                </div>
                <div className="egs-then">Puis {fmt(p.old)} $ / an</div>
                {isXOF && (
                  <>
                    <div className="egs-loc">{fmt(p.xNow)} XOF <span style={{ fontWeight: 400 }}>1re année</span></div>
                    <div className="egs-loc2">{fmt(p.xOld)} XOF / an</div>
                  </>
                )}
                <ul>{p.f.map((x) => <li key={x}>{x}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="egs-edu">
            <b>EGS Éducation</b> — pour les très petites écoles (jusqu'à 150 élèves) :{" "}
            <b>{fmt(EDU_USD)} $ / an</b>{isXOF && <> ({fmt(EDU_XOF)} XOF)</>} (remise de lancement non applicable).
          </div>
          <p className="egs-note">
            Prix annuels en USD, adaptés au pouvoir d'achat. Monnaie locale indiquée selon le pays.
            Au-delà de 5 000 élèves : nous contacter.
          </p>
        </section>

        <section id="demo" className="egs-demo">
          <h2>Demander une démo</h2>
          <p className="egs-lead" style={{ fontSize: "1.05rem" }}>
            Laissez-nous vos coordonnées, nous vous recontactons rapidement.
          </p>
          <form onSubmit={onDemo} style={{ marginTop: 16 }}>
            <input name="ecole" placeholder="Nom de l'établissement" required />
            <input name="nom" placeholder="Votre nom" required />
            <input name="tel" placeholder="Téléphone / WhatsApp" required />
            <textarea name="msg" rows={3} placeholder="Nombre d'élèves, besoins…" />
            <button className="egs-btn gold" type="submit">Envoyer sur WhatsApp →</button>
          </form>
        </section>

        <section id="aide" />
      </main>

      <footer className="egs-footer">© EGS — egs.eduforci.com</footer>
    </div>
  );
}
