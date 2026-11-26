import { CONTACT_ADDRESS, LegalPage, type LegalSection } from "@/components/legal/legal-page";

export const metadata = { title: "Cookies · Invariant" };

const SECTIONS: LegalSection[] = [
  {
    title: "Only what the app needs to work",
    body: [
      "The app sets a handful of cookies, each to keep you signed in, keep a choice you made or finish a step you started. None holds a figure of your money, and none is for analytics, advertising or tracking, so there is nothing to opt out of and no banner.",
    ],
  },
  {
    title: "The cookies",
    body: [
      "Your session (authjs.session-token, with a __Secure- prefix on the live site): your sign-in, encrypted, so each page knows it is you. It lasts until you sign out, or 30 days without a visit.",
      "Signing in (authjs.csrf-token and authjs.callback-url, and for Google or Microsoft authjs.pkce.code_verifier and authjs.state): guard the sign-in against forgery and remember the page to open afterwards. The first two last for the browser session, the last two fifteen minutes.",
      "Your theme (pos_theme): light, dark or your device's, so the first paint is already right. It lasts a year.",
      "Stealth mode (pos_stealth): whether every amount of money is hidden on this device, set by the eye beside Settings, so the first paint is already hidden. It lasts a year.",
      "Your time zone (pos_tz): the zone your device reports, such as Europe/Athens, so every day and clock time the app shows, and the hour your review goes out, are on your own clock. Set by the app on your first visit and whenever your device's zone changes. It lasts a year.",
      "An invitation (pos_invite): from 9 November 2026, when sign-up asks for an invitation, the code you typed, set for half an hour once it is checked so you can create the account with Google, Microsoft or your email, then cleared when the account is made.",
      "Linking a Google Drive (pos_drive_link): set for ten minutes while an account made with a password links its Drive, then cleared.",
      "The demo (pos_demo_setup and pos_demo_prefs): the answers and arrangement you choose in the demo, kept in your browser because the demo keeps nothing on a server. They last 30 days and a year.",
    ],
  },
  {
    title: "Notes in your browser",
    body: [
      "Besides cookies, the app keeps a few notes in your browser's own storage on this device alone: when you were last greeted, when you last tapped, typed or scrolled in the app (so a greeting never lands while you are using it), the greeting's quotes this device has shown, whether this window has opened the app before, and the return chart's window you last chose. They are never sent anywhere. From 4 November 2026 the quotes you have been shown are also kept in your preferences, in your own vault, so every device you use shows the next one.",
    ],
  },
  {
    title: "Removing them",
    body: [`Signing out removes the session. Your browser's settings remove the rest at any time; the app then asks you to sign in again and falls back to your device's theme. Questions go to ${CONTACT_ADDRESS}.`],
  },
];

/** Which cookies and browser notes the app keeps, and why (Hamza, 19 Oct 2026: Cookies in the account menu). Public, like the privacy policy. */
export default function CookiesPage() {
  return <LegalPage kicker="Invariant" title="Cookies" dated="9 November 2026" lead="What the app keeps in your browser, what each is for and how long it lasts." sections={SECTIONS} />;
}
