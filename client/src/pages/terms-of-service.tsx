import { Link } from 'wouter';
import Logo from '@/components/Logo';

/**
 * Plain-English Terms of Service. Three things it has to do:
 *  1. Clarify that virtual chips have no real-world value (this is the
 *     gambling-policy escape hatch for AdSense / app stores).
 *  2. Set basic conduct rules (no harassment, no cheating).
 *  3. Limit our liability since we're a free hobby project.
 */
export default function TermsOfService() {
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

        <h1 className="text-3xl font-bold text-gradient-gold">Terms of Service</h1>

        <section className="space-y-3 text-sm text-gold-light/80 leading-relaxed">
          <p>
            By using Snatch&amp;GrabIt! (the "Service") you agree to these terms. They
            keep things friendly and clear; if you disagree with any of them, please
            don't use the Service.
          </p>
        </section>

        <Section heading="No real money. None.">
          <p>
            Virtual chips, credits, and any winnings displayed inside the Service have
            <strong> no real-world monetary value</strong>. They cannot be cashed out,
            traded for currency, or redeemed for goods or services outside the
            Service. The "betting" mechanic is a gameplay feature, not gambling. We
            don't take real money for chips, and we don't pay out real money for wins.
          </p>
        </Section>

        <Section heading="Age">
          <p>
            You must be at least <strong>18 years old</strong> to use the Service.
            Card-game themes with virtual stakes aren't appropriate for younger users
            and we don't allow accounts for under-18s.
          </p>
        </Section>

        <Section heading="Account rules">
          <ul className="list-disc pl-5 space-y-1">
            <li>One account per person. No automation, no bots (except the AI players we provide).</li>
            <li>Don't share account credentials. You're responsible for activity on your account.</li>
            <li>Don't upload anything you don't have rights to as your card-back image (no copyrighted artwork, no images of real people without consent).</li>
          </ul>
        </Section>

        <Section heading="Behaviour">
          <ul className="list-disc pl-5 space-y-1">
            <li>Be civil. No harassment, hate speech, or threats in chat, display names, or invites.</li>
            <li>No exploiting bugs to manipulate scores or chips. If you find one, tell us instead.</li>
            <li>Don't attempt to break, overload, or reverse-engineer the Service.</li>
          </ul>
          <p className="mt-2">
            We may suspend or remove accounts that break these rules without notice.
          </p>
        </Section>

        <Section heading="Content you create">
          <p>
            Display names, chat messages, and card-back images you upload remain
            yours. You grant us a limited licence to store and display them so the
            Service can do its job (show your chat to other players, render your card
            back in games). You can delete this content at any time by editing your
            profile or deleting your account.
          </p>
        </Section>

        <Section heading="Service availability">
          <p>
            We try to keep the Service running but make no guarantees. It may be down
            for maintenance, deploys, or because something broke. Games in progress
            during downtime may be lost. We're working on persistence — but until
            that ships, don't rely on a game-in-progress surviving a server restart.
          </p>
        </Section>

        <Section heading="Disclaimer of warranties">
          <p>
            The Service is provided "as is", without warranty of any kind. We don't
            warrant that it will be uninterrupted, error-free, or that any data will
            be preserved indefinitely.
          </p>
        </Section>

        <Section heading="Limitation of liability">
          <p>
            To the maximum extent permitted by law, we are not liable for indirect,
            incidental, or consequential damages arising from your use of the
            Service. Our total liability for any direct damages is limited to the
            amount you've paid us — which is zero, because the Service is free.
          </p>
        </Section>

        <Section heading="Changes to these terms">
          <p>
            We may update these terms as the Service evolves. Material changes will
            be announced in-app the next time you log in. Continued use after a
            change means you accept the new terms.
          </p>
        </Section>

        <Section heading="Contact">
          <p>
            Questions about these terms?{' '}
            <a className="text-gold underline" href="mailto:scott@tendersmith.com">
              scott@tendersmith.com
            </a>
          </p>
        </Section>

        <footer className="border-t border-gold/15 pt-4 text-xs text-gold-light/50 flex flex-wrap gap-3">
          <Link href="/" className="hover:text-gold">Home</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-gold">Privacy Policy</Link>
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
