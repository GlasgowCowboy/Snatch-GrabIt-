import { Link } from 'wouter';
import Logo from '@/components/Logo';

/**
 * Static privacy policy. Plain language, no legalese template. Covers what we
 * actually do today; update when we add ad networks, payments, etc.
 *
 * Sections track AdSense's required disclosures (cookies / third parties /
 * data retention / user rights) so this also serves as the publisher policy
 * page during AdSense application.
 */
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen felt-bg p-4 md:p-8">
      <div className="max-w-3xl mx-auto glass-strong rounded-2xl border border-gold/20 p-6 md:p-10 space-y-6">
        <header className="flex items-center justify-between border-b border-gold/15 pb-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80">
            <Logo size={28} className="text-gold" />
            <span className="text-xl font-bold text-gradient-gold">Snatch&amp;GrabIt!</span>
          </Link>
          <span className="text-xs text-gold-light/50">Last updated: 25 May 2026</span>
        </header>

        <h1 className="text-3xl font-bold text-gradient-gold">Privacy Policy</h1>

        <section className="space-y-3 text-sm text-gold-light/80 leading-relaxed">
          <p>
            Snatch&amp;GrabIt! is a multiplayer card game that runs in your browser. This
            policy explains what data we collect, why, and what we do with it. We aim
            for plain English over legalese; if anything here is unclear, email
            <a className="text-gold underline ml-1" href="mailto:scott@tendersmith.com">scott@tendersmith.com</a>.
          </p>
        </section>

        <Section heading="What we collect">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data</strong> — username, password (hashed with scrypt), and optionally an email address if you choose to provide one. Email is only used for password reset and game invites.</li>
            <li><strong>Profile data</strong> — your display name, an optional uploaded card-back image (stored as a base64 string), and your in-app preferences (table theme, bone pile position).</li>
            <li><strong>Game data</strong> — finished-game results, placements, declared-out status, and virtual chip / credit balances. We don't keep moment-to-moment game state once the game ends.</li>
            <li><strong>Session cookies</strong> — a single httpOnly cookie that keeps you signed in across pages. No tracking cookies set by us today.</li>
            <li><strong>Server logs</strong> — short-lived web-server logs (IP, request path, status code) used to debug errors. Retained no longer than 30 days.</li>
          </ul>
        </Section>

        <Section heading="What we don't collect">
          <ul className="list-disc pl-5 space-y-1">
            <li>Real-money payment information. Virtual chips have <strong>no real-world value</strong> and cannot be cashed out.</li>
            <li>Location data, contact lists, or device-fingerprinting identifiers.</li>
            <li>Cross-site tracking pixels.</li>
          </ul>
        </Section>

        <Section heading="Third parties">
          <p>The following services receive limited data from us:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Neon / Postgres</strong> — database host. Stores everything in "What we collect".</li>
            <li><strong>Render</strong> — web-app host. Sees inbound HTTP traffic for normal request routing.</li>
            <li><strong>Resend</strong> (when configured) — outbound email delivery for invites and password resets. Receives the recipient email plus the message body.</li>
            <li><strong>Google AdSense</strong> (planned, once approved) — will serve banner ads on the site. AdSense uses cookies and similar technologies to serve relevant ads. You can manage your ad personalisation preferences at <a className="text-gold underline" href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">adssettings.google.com</a>. Google's own privacy policy applies to ad data: <a className="text-gold underline" href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">policies.google.com/technologies/ads</a>.</li>
          </ul>
        </Section>

        <Section heading="Your rights">
          <ul className="list-disc pl-5 space-y-1">
            <li>You can request a copy of the data we hold on you by emailing the address above.</li>
            <li>You can request deletion of your account and associated data at any time. Game history and bet records that reference you may be retained anonymously (your userId removed) for accounting integrity.</li>
            <li>You can opt out of personalised ads via Google's settings linked above.</li>
            <li>You can stop receiving invite/reset emails by deleting your account.</li>
          </ul>
        </Section>

        <Section heading="Children">
          <p>Snatch&amp;GrabIt! is intended for users aged 18 and over. It is not directed to children. We do not knowingly collect data from anyone under 18; if we learn we have, we will delete it.</p>
        </Section>

        <Section heading="Changes to this policy">
          <p>We may update this policy as the app grows (new payment integrations, new ad networks). Material changes will be announced in-app the next time you log in.</p>
        </Section>

        <footer className="border-t border-gold/15 pt-4 text-xs text-gold-light/50 flex flex-wrap gap-3">
          <Link href="/" className="hover:text-gold">Home</Link>
          <span>·</span>
          <Link href="/terms" className="hover:text-gold">Terms of Service</Link>
        </footer>
      </div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-gold">{heading}</h2>
      <div className="text-sm text-gold-light/80 leading-relaxed">{children}</div>
    </section>
  );
}
