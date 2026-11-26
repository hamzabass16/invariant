/**
 * Welcome's second part: once the app is built, what to give it, one group
 * at a time, each with why. Pure: the page draws Setup's own cards for each
 * step, and the person may skip any and add it later on Setup.
 */
export type WelcomeStepId = "rules" | "money" | "holdings" | "reads" | "done";
export type WelcomeStep = { id: WelcomeStepId; label: string; title: string; why: string };

export const WELCOME_STEPS: readonly WelcomeStep[] = [
  { id: "rules", label: "Your rules", title: "The rules you invest by, and the AI that reads them", why: "The methodology decides what the Dashboard shows, which checks run and what raises an alert. The AI, run by Invariant, reads your documents and writes the studies and reviews; there is no key to make." },
  { id: "money", label: "Your money", title: "Where your holdings come from", why: "A statement or a read-only key for each place you chose. The app fetches every morning by itself; nothing here can trade." },
  { id: "holdings", label: "Your holdings", title: "Why you hold each company, and what it is worth to you", why: "A few lines per holding and your bear, base and bull per share. Every report after results reads the new figures against them." },
  { id: "reads", label: "What it reads", title: "What the app reads for you", why: "Company filings and the morning refresh run by themselves once you confirm the SEC contact. Forward your newsletters and the daily recap, and they become part of your reviews and After the close." },
  { id: "done", label: "Done", title: "Your app is ready", why: "Everything you gave it, at a glance. Each can be changed on Setup, which is where the tour starts." },
];

/** The step a `?step=` names, or the first. */
export function welcomeStep(param: string | undefined): WelcomeStep {
  return WELCOME_STEPS.find((s) => s.id === param) ?? WELCOME_STEPS[0];
}
