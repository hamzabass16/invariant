import { CONTACT_ADDRESS, LegalPage, type LegalSection } from "@/components/legal/legal-page";

export const metadata = { title: "Terms · Invariant" };

const SECTIONS: LegalSection[] = [
  {
    title: "The service",
    body: [
      "Invariant is a private, read-only console for your own money, provided free of charge by its operator to the people the operator admits. It shows your holdings, judges them against the methodology you wrote and confirmed, and writes reviews and studies with the AI it runs on Claude, up to a monthly allowance per person. It is provided as it is, and may change or stop at any time.",
      "Invariant is open-source software under the MIT licence. Whoever runs this deployment is its operator, and these terms are between you and them; the authors of the software run none of it for you.",
    ],
  },
  {
    title: "Not investment advice",
    body: [
      "Every figure, check, review, study and alert is derived from your own methodology, your own data and public filings. The app computes; it does not recommend. Nothing in it is investment, tax or legal advice, and the operator is not your adviser. You decide what to do with your money, and you check a figure before acting on it. The evaluation of your methodology on Methodology is the app's arithmetic on your past record and what you hold today; past results do not show that a methodology will work. The readings on Performance are words the AI writes about figures the app computed; they are not advice.",
    ],
  },
  {
    title: "Read-only, with your own broker keys",
    body: [
      "The app never places, changes or cancels an order, never creates an alert at a broker, and never writes to a bank or broker. The broker keys and tokens you give it must be read-only, and you remain responsible for them and for the terms of your broker, and your data sources. The AI runs on the operator's own key: each person may use up to a monthly allowance, at list price; past it the AI waits for the 1st of the next month and everything else keeps running. From 9 November 2026, what you ask the AI for yourself runs on your own Claude through the connector, under your own Claude account and its terms, and not against that allowance; the operator and the addresses that run the deployment keep it in the app.",
    ],
  },
  {
    title: "Your account",
    body: [
      "One account is for one person. Keep your password and your broker keys to yourself, and tell the operator at once if you believe someone else has used your account. The operator may close an account or the service at any time; your files stay in your own Drive either way.",
      "An invitation is for the people it was sent to; do not post it publicly. Nothing on this deployment is charged for. Delete my account on Account settings ends your account and deletes what the deployment keeps about you.",
    ],
  },
  {
    title: "The community",
    body: [
      "Sharing on the Community screen is your choice. What you share (your theses in your words and your weights in percent, under a handle) is shown to everyone signed in on this deployment, and while you share, the card follows your theses and weights as they change and the people who follow you are told of a changed thesis or a weight that moved; share nothing you would not want them to read. What others share is their opinion, not advice and not checked by the app or the operator; the app shows it as they wrote it. Do not share another person's words or data as your own. The operator may remove a shared card that breaks these terms. The community index on the same screen is drawn from the shared weights alone, listing only what five or more people hold; it is a count of opinions, not a recommendation.",
    ],
  },
  {
    title: "Data and its limits",
    body: [
      "Figures come from your broker's statements, public filings and public market feeds. They can be late, incomplete or wrong, and a feed can stop. The app says when it cannot read something rather than showing a zero, but it makes no promise that a figure is right or current. A company's figures are read once for everyone and can be a few days old; their multiples are laid at the latest close, and priced-in growth is the app's arithmetic on the filings, not a forecast.",
      "A newsletter or a podcast is its writer's or its hosts' argument. The app shows a write-up of it made by the AI, and a podcast's transcript comes from podscripts.co, made by machine; either can be wrong. A picture a thesis shows is drawn from its own web address and stays its owner's. What the Thesis Hunter and the Research Agent find, and what the price assumes, are a model's reading of other people's work, each with its source: check the source before relying on it. The costs the Agents screen shows and on Setup are estimates from the model service's token counts at list prices. A thesis you export as a PDF is yours to share; the pictures in it stay their owners'.",
      "An event report is a model's reading of what was decided, what was expected and how investors took it, from the official page and the day's reporting it cites; the reading can be wrong. An earnings report is the app's figures and checks with a model's reading of the release and the call, checked by a second reading before it is sent; either can be wrong where the pages are.",
    ],
  },
  {
    title: "No warranty, limited liability",
    body: [
      "The service is provided without warranty of any kind, to the extent the law allows. The operator is not liable for any loss arising from your use of it, including a decision you made on a figure it showed, to the extent the law allows.",
    ],
  },
  {
    title: "The demo",
    body: ["The public demo shows a real portfolio, anonymized and frozen on a past date, with a guided tour. It saves nothing, reads no Drive and calls no model."],
  },
  {
    title: "Changes and contact",
    body: [`A change to these terms is made on this page with a new date. Using the app after a change means you accept it. Questions go to ${CONTACT_ADDRESS}.`],
  },
];

/** The terms of service, public so Google's consent screen can link them. */
export default function TermsPage() {
  return <LegalPage kicker="Invariant" title="Terms of service" dated="26 November 2026" lead="These are the terms on which Invariant is offered to you. They are short because the app does little in your name: it reads, computes and tells you." sections={SECTIONS} />;
}
