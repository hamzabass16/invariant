// eslint-config-next v16 ships flat config directly; no FlatCompat needed.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  // next-env.d.ts is generated and rewritten by Next on every build.
  {
    // .claude/worktrees: other sessions' checkouts, each with its own .next.
    ignores: ["drizzle/**", ".next/**", "node_modules/**", "next-env.d.ts", ".claude/worktrees/**"],
  },
];

export default config;
