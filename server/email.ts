// Thin email helper. In production with RESEND_API_KEY set, sends via Resend.
// Without a key (dev/test), logs the message to the console instead — so the
// dev flow doesn't break when there's no API key configured, and you can copy
// the reset-password / verification link straight out of the terminal.

import { Resend } from 'resend';
import { log } from './vite';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

const DEFAULT_FROM = process.env.EMAIL_FROM ?? 'Snatch&GrabIt! <onboarding@resend.dev>';

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain text fallback. */
  text: string;
  /** Optional rich body; if absent, a minimal HTML wrapper around `text` is used. */
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<{ delivered: boolean }> {
  const resend = getResend();

  if (!resend) {
    // Dev / test fallback — print the email so the developer can act on it.
    log(`[email:console] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    return { delivered: false };
  }

  try {
    const result = await resend.emails.send({
      from: DEFAULT_FROM,
      to,
      subject,
      text,
      html: html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    });
    if (result.error) {
      log(`[email:resend] failed to send to ${to}: ${result.error.message}`);
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    log(`[email:resend] threw while sending to ${to}: ${(err as Error).message}`);
    return { delivered: false };
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Base URL used when building links in emails. Falls back to a dev default. */
export function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}
