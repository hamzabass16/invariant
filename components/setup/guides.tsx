import { Steps, type Step } from "@/components/setup/steps";

export { Steps, type Step };

/**
 * The step-by-step guides for every input a person can choose, written for
 * someone who is not technical: where to go, what to type, what to tick,
 * what happens next. Each says plainly what is live today; nothing is
 * promised that the app does not do. Each shows once, on its own card on
 * Setup.
 */

/** SnapTrade Personal: the person's own free key, which sees their own accounts and nobody else's. */
export const SNAPTRADE_STEPS = (label: string): Step[] => [
  { title: "Make a free SnapTrade account", detail: "On a computer, open dashboard.snaptrade.com/signup and sign up with your email. SnapTrade is the read-only bridge many brokers accept. Its Personal plan is free for your own accounts, with no card, up to 20 broker connections." },
  { title: "Copy your key", detail: "In SnapTrade's dashboard open the API Key page (dashboard.snaptrade.com/api-key) and make your Personal key if it asks. Copy the Client ID and the Consumer Key. The consumer key may be shown only once; keep it until you have pasted it here." },
  { title: "Keep it here", detail: "On the Other brokers card on Setup, open Keep your key, paste both and press Keep and fetch. The first fetch says no broker is connected yet; that is expected." },
  { title: `Connect ${label}`, detail: `Press Connect a broker. SnapTrade's own page opens: pick ${label}, sign in on its own page with any two-step code it asks for. The app asks only for read access; Invariant never sees your password and cannot trade.` },
  { title: "Come back and fetch", detail: "SnapTrade sends you back to Setup. Press Fetch now. Each account appears on Holdings and under Portfolios, named by the broker and the account, and is fetched again every morning. Connect more brokers the same way; one key covers them all." },
];

/** Your own Claude: Invariant added as a custom connector, signed in with the same account as the app. */
export const CLAUDE_STEPS = (demo: boolean): Step[] => [
  { title: "Copy the address", detail: "Copy the address above. It is this app's own MCP server; it only reads." },
  { title: "Open Connectors in Claude", detail: "On claude.ai or in the Claude desktop app, open Customize, then Connectors, and press Add custom connector. Any plan can add one, the Free plan one only. On a Team or Enterprise plan an Owner adds it under Organization settings, Connectors, and you then press Connect." },
  { title: "Paste and add", detail: demo ? "Name: Invariant demo. Paste the address as the server URL. For Authentication choose No sign-in. Press Add." : "Name: Invariant. Paste the address as the server URL. Leave the sign-in settings as Claude offers them and press Add." },
  demo
    ? { title: "Ask about the snapshot", detail: "In a chat, press +, open Connectors and turn Invariant demo on. Ask, for example: which holdings break a cap, and under which section? Claude reads the anonymized snapshot the tour shows." }
    : { title: "Sign in and allow", detail: "Press Connect. Invariant opens: sign in with the same Google account you use here and press Allow read-only access. Claude can then read; it writes nothing but a thesis or a newsletter proposal, each left on its screen for you to review." },
  ...(demo
    ? []
    : [{ title: "Ask about your portfolio", detail: "In a chat, press +, open Connectors and make sure Invariant is on. Ask, for example: which rules am I breaking this week, and what does my methodology say to do? Every figure comes from the app, with its section. On your phone, the Claude app uses the connector once it is added on the web." }]),
  { title: "Add the Invariant skill (optional)", detail: "Download the skill below, then in Claude open Customize, then Skills, and upload the zip as it is. It tells Claude which of the app's tools to call first, to take every number from them and to cite each rule's section, so answers stay in the app's figures." },
];

/** ChatGPT (Hamza, 21 Oct 2026): the same server added as an app in developer mode, signed in the same way. */
export const CHATGPT_STEPS = (demo: boolean): Step[] => [
  { title: "Turn on developer mode", detail: "On chatgpt.com, open Settings, then Apps, then Advanced settings, and turn Developer mode on. ChatGPT offers it on its paid plans; on a Business or Enterprise plan an admin may need to allow it." },
  { title: "Create the app", detail: demo ? "Back in Settings, Apps, press Create. Name: Invariant demo. MCP server URL: the address above. Authentication: No authentication. Tick that you trust it and press Create." : "Back in Settings, Apps, press Create. Name: Invariant. MCP server URL: the address above. Authentication: OAuth, with nothing else filled in; ChatGPT registers itself. Tick that you trust it and press Create." },
  demo
    ? { title: "Ask about the snapshot", detail: "In a chat, press +, choose Developer mode and turn Invariant demo on. Ask, for example: which holdings break a cap, and under which section?" }
    : { title: "Sign in and allow", detail: "ChatGPT opens Invariant: sign in with the same account you use here and press Allow read-only access. ChatGPT asks you before it uses a tool that writes (a thesis, a newsletter proposal); on some plans it uses only the tools that read." },
  ...(demo ? [] : [{ title: "Ask about your portfolio", detail: "In a chat, press +, choose Developer mode and turn Invariant on. Every figure comes from the app, with its section. To stop it, delete the app under Settings, Apps." }]),
];

/** eToro's own API: two keys the person makes in eToro, with Read permission. */
export const ETORO_STEPS: Step[] = [
  { title: "Open API Key Management", detail: "On eToro's website, open Settings, then Trading, and scroll to API Key Management. Press Create New Key." },
  { title: "Make a read-only key", detail: "Key name: Invariant. Environment: Real. Permissions: Read only, never Write. Leave the IP whitelist empty: the app's server has no fixed address. An expiry date is optional; when it passes, make a new key and keep it here again." },
  { title: "Confirm it", detail: "Press Generate Key and type the code eToro sends to your phone." },
  { title: "Copy both keys", detail: "Under Generated Keys, copy the Public API Key and the User Key. The User Key is shown once." },
  { title: "Keep and fetch", detail: "On the Other brokers card on Setup, open Keep your key, paste both and press Keep and fetch. Your positions and cash appear on Holdings in US dollars, each at what it is worth now; a trader you copy is an account of its own. The app fetches again every morning." },
];

export function mailSteps(kind: string, inbox: string | null, helper: string): Step[] {
  return [
    { title: "Find your statements address", detail: inbox ? `Yours is ${inbox}. It is on the Statements screen with a Copy button. Only mail sent to it is read; nothing else in your mailbox is touched.` : `${helper} sets up a statements address for you once; it then appears on the Statements screen. Nothing to do until it does.` },
    { title: "Forward automatically from Gmail (on a computer, once)", detail: "Open Gmail on a computer. Gear icon, See all settings, the Forwarding and POP/IMAP tab, Add a forwarding address, paste the address. Then for each bank or fund that emails you: type its address in the search bar, press the sliders icon, Create filter, tick Forward it to, pick the address, Create filter." },
    { title: "Or forward by hand", detail: `When a ${kind} arrives, open it and forward it to the address, attachment included. On a phone: open the PDF, tap Share, choose Mail, paste the address, send.` },
    { title: "When a bank only says the statement is ready", detail: "Download the PDF from the bank as usual and send it to the same address. Notifications reminds you when one is waiting." },
    { title: "What happens next", detail: `Each statement is read into your figures; a page that cannot be read is checked by hand by ${helper} before anything shows. Each card on Setup says how old its figures are.` },
  ];
}

/** Newsletters: a forwarding address added to Gmail once, then one filter on the senders; in Gmail's own words. */
export function newsletterSteps(address: string | null, helper: string): Step[] {
  return [
    { title: "Add your newsletters address to Gmail (on a computer, once)", detail: address ? `Open Gmail on a computer. Gear icon, See all settings, the Forwarding and POP/IMAP tab, Add a forwarding address, paste ${address}, then Next and Proceed. Gmail sends a confirmation request to it.` : `${helper} sets up the inbox once; your newsletters address then appears here. Nothing to do until it does.` },
    { title: "Let the app confirm Gmail's request", detail: "Leave Setup open or press Check for newsletters now on this card: the app confirms Gmail's request by itself and says so; the morning refresh does the same. Should Google not take it from here, the code and the link appear there for you. Leave forwarding itself off; only the filter sends anything." },
    { title: "Make a filter that forwards them", detail: "In step 2 below, let your Claude find the newsletters in your mail (a prompt to paste, with the Gmail and Invariant connectors on), or paste their senders: the filter writes itself and Open in Gmail opens Gmail's filter box with it filled in. Click Create filter, tick Forward it to, choose your newsletters address, Create filter. They stay in your inbox as before." },
    { title: "What happens next", detail: "Each newsletter is read once, as text, by the AI into a topic, two lines and the points that touch your holdings. Only the digest is kept, never the email; the weekly and monthly review carry the period's." },
  ];
}

/** A property, entered once by the person who runs the app from these notes. */
export const PROPERTY_STEPS = (helper: string): Step[] => [
  { title: "For each property, note", detail: "The address or area, roughly its size, whether it is rented long-term, rented short-stay or for your own use, what you think it is worth today, any mortgage left on it, and your share of it if not all yours." },
  { title: "Give it to the person who runs the app", detail: `${helper} enters each property once from those notes; there is no form to fill in yourself yet.` },
  { title: "What happens next", detail: "Each property shows on Real estate with its equity and loan to value, and is watched every week for rents nearby and local news that could move its price." },
];

/** Any other asset, entered once by the person who runs the app. */
export const OTHER_ASSET_STEPS = (helper: string): Step[] => [
  { title: "For each asset, note", detail: "What it is (a private company stake, a loan you made, art, a vehicle), roughly what it is worth, in which currency, and as of when." },
  { title: "Give it to the person who runs the app", detail: `${helper} enters each one once; there is no form to fill in yourself yet.` },
  { title: "What happens next", detail: "It shows on Allocation under Other, dated by the value you gave, and is counted in your net worth until you say otherwise." },
];
