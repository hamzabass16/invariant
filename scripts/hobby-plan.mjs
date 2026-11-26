// Fits a fork to Vercel's free Hobby plan: every cron once a day, and no
// function longer than 300 seconds (what this project met on Hobby before it
// moved to Pro, docs/adr/0008-vercel-pro-dispatcher.md). Run it once in your
// own fork, then commit the result:
//
//   node scripts/hobby-plan.mjs
//
// What you lose: results are read the next morning instead of within the
// quarter hour, a review goes out at the morning run instead of its own hour,
// and a long read that a Pro function would finish is picked up by the next run.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HOBBY_MAX_SECONDS = 300;

// 1. vercel.json: one cron per path, once a day. A path that runs several
// times keeps its latest run up to 21:xx UTC, so the evening read comes after
// the US close in winter (21:00 UTC) as well as summer; any other keeps the
// hour it names, else 06:00 UTC.
const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const daily = [];
for (const cron of config.crons ?? []) {
  const [minute, hour] = cron.schedule.split(" ");
  const fixed = { path: cron.path, minute: /^\d+$/.test(minute) ? Number(minute) : 0, hour: /^\d+$/.test(hour) ? Number(hour) : 6 };
  const kept = daily.find((c) => c.path === cron.path);
  if (!kept) daily.push(fixed);
  else if (fixed.hour <= 21 && fixed.hour > kept.hour) Object.assign(kept, fixed);
}
config.crons = daily.map((c) => ({ path: c.path, schedule: `${c.minute} ${c.hour} * * *` }));
writeFileSync("vercel.json", `${JSON.stringify(config, null, 2)}\n`);
console.log(`vercel.json: ${daily.length} crons, each once a day`);

// 2. Every route or page that asks for more than 300 seconds asks for 300.
function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

let changed = 0;
for (const file of filesUnder("app").filter((f) => /\.(ts|tsx)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  const next = text.replace(/export const maxDuration = (\d+);/, (line, seconds) =>
    Number(seconds) > HOBBY_MAX_SECONDS ? `export const maxDuration = ${HOBBY_MAX_SECONDS};` : line,
  );
  if (next !== text) {
    writeFileSync(file, next);
    changed += 1;
  }
}
console.log(`${changed} functions set to ${HOBBY_MAX_SECONDS} seconds`);
