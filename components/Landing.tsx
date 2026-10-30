"use client";

import Link from "next/link";
import "./landing.css";

// ====== À PERSONNALISER ======
const WHATSAPP = "2250575516214"; // numéro WhatsApp, format international sans +
const WHATSAPP_AFFICHE = "05 75 51 62 14";
const TELEPHONE = "01 53 10 95 86";
const APP_URL = "/login"; // page de connexion

// Tes tarifs. Tant que la liste est vide, la page affiche « Demandez un devis ».
// Exemple d'une ligne :
// { nom: "Petite école", prix: "à toi de fixer", detail: "Jusqu'à 200 élèves", points: ["…", "…"], vedette: false }
type Offre = { nom: string; prix: string; detail: string; points: string[]; vedette?: boolean };
const OFFRES: Offre[] = [];
// =============================

const PROFILS = [
  ["🏛️", "Direction", "Piloter l'école, suivre les chiffres clés et valider ce qui doit l'être."],
  ["🧑‍🏫", "Enseignants", "Saisir les notes et les absences, tenir le cahier de textes."],
  ["👨‍👩‍👧", "Parents", "Consulter les bulletins, régler les frais et échanger avec l'école."],
  ["🎒", "Élèves", "Retrouver son emploi du temps, ses devoirs et ses résultats."],
  ["💼", "Secrétariat et comptabilité", "Gérer inscriptions, scolarités, reçus et dépenses."],
];

export default function Landing() {
  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const texte =
      `Bonjour, je souhaite une démonstration d'EGS.\n` +
      `École : ${d.get("ecole")}\nContact : ${d.get("nom")}\nTéléphone : ${d.get("tel")}\n` +
      `${d.get("msg") ?? ""}`;
    window.location.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texte)}`;
  }

  return (
    <div className="egs">
      <header className="egs-top">
        <div className="egs-brand"><i>🎓</i>EGS</div>
        <nav className="egs-nav">
          <a className="egs-btn" href="#contact">Démo</a>
          <Link className="egs-btn main" href={APP_URL}>Se connecter</Link>
        </nav>
      </header>

      <main className="egs-wrap">
        <section className="egs-hero">
          <h1>Votre école, enfin bien organisée.</h1>
          <p>
            EGS rassemble la scolarité, la pédagogie, la comptabilité et la communication dans
            un seul outil, accessible depuis un simple téléphone.
          </p>
          <div className="row">
            <a className="egs-btn main" href="#contact">Voir une démonstration</a>
            <Link className="egs-btn" href={APP_URL}>J'ai déjà un compte</Link>
          </div>
        </section>

        <div className="egs-points">
          <div className="egs-point"><span>⚡</span><p>Moins de papier, plus de temps pour les élèves</p></div>
          <div className="egs-point"><span>📱</span><p>Utilisable partout, même avec une connexion limitée</p></div>
          <div className="egs-point"><span>🔒</span><p>Données sécurisées et sauvegardées</p></div>
        </div>

        <section className="egs-sec" id="profils">
          <h2>Chacun trouve son espace</h2>
          <p className="sub">Chaque utilisateur voit uniquement ce qui le concerne.</p>
          <div className="egs-cards">
            {PROFILS.map(([ic, t, p]) => (
              <div className="egs-card" key={t}>
                <div className="ic">{ic}</div>
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="egs-sec" id="demarrer">
          <h2>Prêt à l'emploi en trois temps</h2>
          <div className="egs-steps">
            <div className="egs-step"><b className="n">1</b><div><h3>Vous inscrivez l'école</h3><p>Une démonstration, puis l'inscription de votre établissement.</p></div></div>
            <div className="egs-step"><b className="n">2</b><div><h3>Vous recevez votre code</h3><p>Le responsable de l'école reçoit son accès et organise son espace comme il le veut.</p></div></div>
            <div className="egs-step"><b className="n">3</b><div><h3>Tout le monde se connecte</h3><p>Enseignants, parents, élèves et personnel entrent avec leurs propres identifiants.</p></div></div>
          </div>
        </section>

        <section className="egs-sec" id="tarifs">
          <h2>Des tarifs adaptés à votre école</h2>
          {OFFRES.length > 0 ? (
            <div className="egs-plans">
              {OFFRES.map((o) => (
                <div className={`egs-plan${o.vedette ? " hot" : ""}`} key={o.nom}>
                  <h3>{o.nom}</h3>
                  <div className="price">{o.prix}</div>
                  <p style={{ color: "var(--mut)", marginBottom: 10 }}>{o.detail}</p>
                  <ul>{o.points.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="egs-quote">
              <h3>Un prix selon votre nombre d'élèves</h3>
              <p>Dites-nous la taille de votre établissement, nous vous envoyons une proposition claire.</p>
              <a className="egs-btn main" href="#contact">Demander un devis</a>
            </div>
          )}
        </section>

        <form className="egs-form" id="contact" onSubmit={envoyer}>
          <h2>Parlons de votre école</h2>
          <input name="ecole" placeholder="Nom de l'établissement" required />
          <input name="nom" placeholder="Votre nom" required />
          <input name="tel" placeholder="Téléphone ou WhatsApp" required />
          <textarea name="msg" rows={3} placeholder="Nombre d'élèves, questions…" />
          <button className="egs-btn main" type="submit">Envoyer par WhatsApp</button>
        </form>
      </main>

      <footer className="egs-foot">
        <p><b>EGS · Espace de Gestion Scolaire</b></p>
        <p>WhatsApp : <a href={`https://wa.me/${WHATSAPP}`}>{WHATSAPP_AFFICHE}</a> · Téléphone : <a href={`tel:${TELEPHONE.replace(/\s/g, "")}`}>{TELEPHONE}</a></p>
      </footer>
    </div>
  );
}
