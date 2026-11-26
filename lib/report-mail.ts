import "server-only";

import nodemailer from "nodemailer";

import type { AlertsEmail } from "@/lib/alerts";
import { renderHtml, renderText, type Report } from "@/lib/report";
import { SyncError } from "@/lib/sync-error";
import { CODE_MINUTES } from "@/lib/users";

/**
 * The one mail path. A report, or the alerts a check found new, goes to the address the person signs in with
 * and to nobody else: the address comes from the enrolment or the session,
 * never from a form. The one exception is the sign-up code, sent to the
 * address being verified, which becomes the sign-in address once the code
 * is entered (lib/users.ts). Nothing in the app composes, forwards or replies to
 * mail. `npm run check:guard` fails on a mail call anywhere else.
 *
 * The operator's SMTP account sends it: MAIL_HOST, MAIL_PORT, MAIL_USER,
 * MAIL_PASSWORD and MAIL_FROM in Vercel. For Gmail that is smtp.gmail.com,
 * 465, the address and an app password.
 */

const VARIABLES = ["MAIL_HOST", "MAIL_USER", "MAIL_PASSWORD", "MAIL_FROM"] as const;

export function mailConfigured(): boolean {
  return VARIABLES.every((name) => !!process.env[name]);
}

export function mailProblem(): string | null {
  const missing = VARIABLES.filter((name) => !process.env[name]);
  if (missing.length) return `Set ${missing.join(", ")} in Vercel to send reports.`;
  const port = Number(process.env.MAIL_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "MAIL_PORT is not a port number.";
  return null;
}

/** A review's PDF for the email (lib/review-pdf.ts, the plan the Reviews page is drawn from too), when it was made. */
export type ReviewPdf = { name: string; pdf: Uint8Array };

export async function sendReport(toSignInAddress: string, report: Report, pdf: ReviewPdf | null = null): Promise<void> {
  const attachments: Attachment[] = pdf?.pdf.length ? [{ filename: pdf.name, content: Buffer.from(pdf.pdf), contentType: "application/pdf" }] : [];
  await send(toSignInAddress, { subject: report.title, text: renderText(report, !!attachments.length), html: renderHtml(report, !!attachments.length), attachments }, "The report was built but the email could not be sent. Try again later.");
}

/** The alerts a check found new (lib/alerts.ts alertsEmail), to the same address and through the same account as the reports. */
export async function sendAlerts(toSignInAddress: string, mail: AlertsEmail): Promise<void> {
  await send(toSignInAddress, mail, "The alerts were kept but the email could not be sent; the next check tries again.");
}

/** A file sent with a report: its name, its bytes and its type. */
export type ReportFile = { name: string; bytes: Uint8Array; type: string };

/** A report after a company's results (lib/earnings-email.ts), with the earnings report as a PDF once it is whole, to the same address. */
export async function sendEarningsReport(toSignInAddress: string, mail: AlertsEmail, files: readonly ReportFile[]): Promise<void> {
  const attachments = files.filter((f) => f.bytes.length).map((f) => ({ filename: f.name, content: Buffer.from(f.bytes), contentType: f.type }));
  await send(toSignInAddress, { ...mail, attachments }, "The report was kept but the email could not be sent; the next check tries again.");
}

/** The sign-up code, to the address being verified. The code is in the mail and nowhere else: never in a log or a response. */
export async function sendSignUpCode(toAddress: string, code: string): Promise<void> {
  const text = `Your Invariant code is ${code}. It works for ${CODE_MINUTES} minutes.\n\nIf you did not ask to create an account, ignore this email; nothing was made.`;
  const html = `<p style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1b1d23">Your Invariant code is</p><p style="font-family:ui-monospace,Menlo,monospace;font-size:32px;letter-spacing:0.2em;color:#1b1d23;margin:8px 0 16px">${code}</p><p style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;color:#6e7382">It works for ${CODE_MINUTES} minutes. If you did not ask to create an account, ignore this email; nothing was made.</p>`;
  await send(toAddress, { subject: "Your Invariant code", text, html }, "The code could not be emailed. Try again in a moment.");
}

type Attachment = { filename: string; content: Buffer; contentType: string };

async function send(toSignInAddress: string, mail: { subject: string; text: string; html: string; attachments?: Attachment[] }, failed: string): Promise<void> {
  const problem = mailProblem();
  if (problem) throw new SyncError("This deployment cannot send email yet.", problem);
  const port = Number(process.env.MAIL_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST!,
    port,
    secure: port === 465,
    auth: { user: process.env.MAIL_USER!, pass: process.env.MAIL_PASSWORD! },
  });
  try {
    await transport.sendMail({
      from: { name: "Invariant", address: process.env.MAIL_FROM! },
      to: toSignInAddress,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments ?? [],
    });
  } catch (e) {
    // Only the error's code reaches the log: the message can carry the address or the account.
    const code = (e as { code?: unknown; responseCode?: unknown }) ?? {};
    const detail = typeof code.code === "string" ? code.code : typeof code.responseCode === "number" ? String(code.responseCode) : "failed";
    throw new SyncError(failed, `smtp ${detail}`);
  }
}
