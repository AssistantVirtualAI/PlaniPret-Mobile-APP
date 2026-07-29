import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PlanipretLangSwitch } from "@/components/planipret/PlanipretLangSwitch";

export default function PlanipretPrivacy() {
  const nav = useNavigate();
  return (
    <div className="planipret-scope min-h-screen" style={{ background: "var(--pp-bg-base)" }}>
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "var(--pp-bg-deep)", borderBottom: "1px solid var(--pp-bg-border)" }}>
        <button onClick={() => nav(-1)} className="p-2 rounded-lg" style={{ color: "var(--pp-text-secondary)" }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 16, color: "var(--pp-text-primary)" }}>
          🔏 Politique de confidentialité
        </h1>
        <div className="ml-auto"><PlanipretLangSwitch /></div>
      </header>
      <article className="px-5 py-6 max-w-2xl mx-auto space-y-6" style={{ color: "var(--pp-text-secondary)", fontSize: 14, lineHeight: 1.7 }}>
        <p style={{ color: "var(--pp-text-muted)", fontSize: 12 }}>Version 2026-06 · Conforme Loi 25 (Québec) et PIPEDA (Canada)</p>

        <Section n="1" title="Données collectées">
          Planiprêt AI Portal collecte les informations strictement nécessaires à la prestation de services
          téléphoniques aux courtiers : profil utilisateur (nom, courriel, extension), métadonnées d'appels
          entrants et sortants, messages texte, messages vocaux, transcriptions, et analyses IA des appels.
        </Section>

        <Section n="2" title="Utilisation des données">
          Les données sont utilisées pour : router les appels, fournir l'historique téléphonique, générer des
          rapports d'activité, alimenter les fonctionnalités d'assistant IA, et assurer la sécurité de la plateforme.
        </Section>

        <Section n="3" title="Partage avec des tiers">
          Vos données sont partagées uniquement avec nos sous-traitants techniques : <strong>NS-API</strong> (téléphonie),
          <strong> ElevenLabs</strong> (synthèse vocale IA), <strong>Microsoft 365</strong> (calendrier/courriel — sur consentement),
          et <strong>Maestro</strong> (CRM hypothécaire — sur consentement). Aucune donnée n'est vendue à des tiers marketing.
        </Section>

        <Section n="4" title="Durée de conservation">
          Appels et messages : 365 jours · Messages vocaux : 180 jours · Transcriptions et analyses IA : 730 jours ·
          Journal d'audit : 730 jours · Enregistrements audio : 90 jours. Les données sont supprimées automatiquement
          après ces délais.
        </Section>

        <Section n="5" title="Vos droits">
          Vous avez le droit d'accéder à vos données, de les rectifier, de les supprimer, et d'en demander
          la portabilité. Depuis l'application : <em>Plus → Mon Compte → Mes données</em>. Pour toute autre demande,
          écrivez-nous.
        </Section>

        <Section n="6" title="Contact DPO">
          Délégué à la protection des données : <a href="mailto:privacy@planipret.ca" style={{ color: "var(--pp-brand-accent)" }}>privacy@planipret.ca</a>
        </Section>

        <Section n="7" title="Date de mise à jour">
          Dernière mise à jour : 21 juin 2026.
        </Section>
      </article>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontFamily: "Inter,sans-serif", fontWeight: 700, fontSize: 15, color: "var(--pp-text-primary)", marginBottom: 6 }}>
        {n}. {title}
      </h2>
      <p>{children}</p>
    </section>
  );
}
