import "server-only";

import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import https from "node:https";

import { providerFor } from "@/lib/hosted-model";
import { hostsOnDemand } from "@/lib/deployment";
import { addressWithKey, checkAddress, customDataFileSchema, DATA_MODEL, dataDue, dataKeysSchema, dataRequestBody, EMPTY_CUSTOM_DATA, EMPTY_DATA_KEYS, isPrivateIp, MAX_ANSWER_BYTES, nextReading, parseDataResponse, pointsFromAnswer, type ApiSource, type CustomDataFile, type DataDef, type DataReading } from "@/lib/custom-data";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/**
 * Reads the data a person added themselves (lib/custom-data.ts): a public API
 * they pointed at, with their key when it needs one, or their own Claude
 * searching the web. Read-only: one GET to the address they gave, never a
 * write; the only write is the reading, to their own vault.
 *
 * An API is read only at a public https address: checked as written, then at
 * the connection itself (every address the name resolves to must be public,
 * and the connection uses that same answer), with redirects refused, ten
 * seconds at most and a megabyte at most. The key travels only
 * to that API, in the header or parameter they named, and never reaches a
 * log, a screen or a response. A log line carries a status, never the address.
 */

const TIMEOUT_MS = 10_000;

/**
 * The name resolved for the connection itself, refused when any address it
 * gives is not public: the check and the connection use the same answer, so
 * a name cannot pass the check and then point somewhere private.
 */
function publicLookup(hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void): void {
  lookup(hostname, { all: true }).then(
    (addresses) => {
      if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
        const err: NodeJS.ErrnoException = new Error("private address");
        err.code = "EPRIVATE";
        return callback(err, "");
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    },
    (e: NodeJS.ErrnoException) => callback(e, ""),
  );
}

/** The answer of one public https address, as text: a single GET, no redirect followed. Throws a sentence. */
async function fetchPublic(src: ApiSource, key: string | null): Promise<string> {
  const refused = checkAddress(src.url);
  if (refused) throw new SyncError(refused, "address refused");
  const url = new URL(addressWithKey(src, key));
  const headers: Record<string, string> = { accept: src.answer === "csv" ? "text/csv, text/plain, */*" : "application/json, */*", "user-agent": "Invariant (your own data)" };
  if (src.keyIn === "header" && key && src.keyName) headers[src.keyName] = key;
  return new Promise<string>((resolve, reject) => {
    const req = https.get(url, { headers, lookup: publicLookup, timeout: TIMEOUT_MS }, (res) => {
      const status = res.statusCode ?? 0;
      const fail = (sentence: string, detail: string) => {
        res.resume();
        reject(new SyncError(sentence, detail));
      };
      if (status >= 300 && status < 400) return fail("The address answered with a redirect. Use the address it leads to instead.", `api ${status}`);
      if (status === 401 || status === 403) return fail("The API refused the request. Check the key and how it is sent.", `api ${status}`);
      if (status === 404) return fail("The API answered that the address does not exist (404).", "api 404");
      if (status === 429) return fail("The API is limiting requests on this key. It is tried again at the next refresh.", "api 429");
      if (status < 200 || status >= 300) return fail(`The API answered with an error (${status}).`, `api ${status}`);
      if (Number(res.headers["content-length"] ?? 0) > MAX_ANSWER_BYTES) return fail("The answer is over a megabyte. Ask the API for fewer rows.", "answer too large");
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_ANSWER_BYTES) {
          req.destroy();
          reject(new SyncError("The answer is over a megabyte. Ask the API for fewer rows.", "answer too large"));
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", () => reject(new SyncError("The API's answer was cut off.", "answer cut")));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new SyncError("The API did not answer within ten seconds.", "timeout"));
    });
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EPRIVATE") reject(new SyncError("That address leads into a private network; only public addresses are read.", "private address refused"));
      else if (e.code === "ENOTFOUND") reject(new SyncError("That address's name could not be found. Check it for a typing mistake.", "dns failed"));
      else reject(new SyncError("The API could not be reached.", `fetch failed ${e.code ?? ""}`.trim()));
    });
  });
}

/** One definition read once. Never throws: a failure is the reading's problem, with the last good points kept. */
export async function readData(def: DataDef, prev: DataReading | undefined, key: string | null, provider: ModelProvider | null, now: Date): Promise<DataReading> {
  try {
    if (def.source.kind === "api") {
      const text = await fetchPublic(def.source, key);
      try {
        return nextReading(prev, { points: pointsFromAnswer(text, def.source, def.format, localDay(now)) }, now);
      } catch (e) {
        return nextReading(prev, { problem: e instanceof Error ? e.message : "The answer could not be read." }, now);
      }
    }
    if (!provider) return nextReading(prev, { problem: "The AI is not set up on this deployment yet." }, now);
    const cannot = providerCannot(provider, "web_search");
    if (cannot) return nextReading(prev, { problem: cannot }, now);
    const parsed = parseDataResponse(await callModel(provider, dataRequestBody(def, localDay(now), modelFor(provider, process.env.ANTHROPIC_DATA_MODEL || DATA_MODEL)) as ModelRequest, { agent: "words", step: "data", subject: def.id }), def);
    if (!parsed.ok) {
      console.error(`[data] claude read: ${parsed.called ? "did not fit" : "no tool call"}`);
      return nextReading(prev, { problem: `Not read: ${parsed.reason}.` }, now);
    }
    return nextReading(prev, { points: parsed.points, pages: parsed.pages, note: parsed.note }, now);
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[data] ${e.logDetail ?? "failed"}`);
    return nextReading(prev, { problem: e.message }, now);
  }
}

export type DataRun = { read: number; failed: number; sentence: string };

/**
 * Reads the person's data that is due (or the one named, or all when forced)
 * and keeps the readings. Returns null when there was nothing to read, so a
 * morning with nothing due adds no line to Setup.
 */
export async function refreshData(vault: Vault, now: Date, opts: { only?: string; force?: boolean } = {}): Promise<DataRun | null> {
  const file = (await vault.readJson("custom_data", customDataFileSchema)) ?? EMPTY_CUSTOM_DATA;
  const due = file.defs.filter((d) => (opts.only ? d.id === opts.only : opts.force || dataDue(d, file.readings[d.id], now)));
  if (!due.length) return null;
  const [keys, hostedAi] = await Promise.all([
    due.some((d) => d.source.kind === "api" && d.source.keyIn !== "none") ? vault.readJson("data_keys", dataKeysSchema).catch(() => null) : Promise.resolve(null),
    // A figure read by Claude runs on the deployment's key for the operator and the allowlist alone since the beta; anyone else asks their own Claude (lib/ask-claude.ts).
    due.some((d) => d.source.kind === "claude") && hostsOnDemand(vault.owner) ? providerFor(vault) : Promise.resolve(null),
  ]);
  const provider = hostedAi;
  const ownClaude = !hostsOnDemand(vault.owner);
  const k = keys ?? EMPTY_DATA_KEYS;
  const readings = await Promise.all(due.map((d) => (d.source.kind === "claude" && ownClaude ? Promise.resolve(nextReading(file.readings[d.id], { problem: "Read by your own Claude now: Customise has the prompt." }, now)) : readData(d, file.readings[d.id], k.keys[d.id] ?? null, provider, now))));
  // Read again just before writing, so a definition added or removed meanwhile is not undone.
  const latest = (await vault.readJson("custom_data", customDataFileSchema)) ?? file;
  const next: CustomDataFile = { ...latest, readings: { ...latest.readings }, updated: now.toISOString() };
  due.forEach((d, i) => {
    if (latest.defs.some((x) => x.id === d.id)) next.readings[d.id] = readings[i];
  });
  await vault.writeJson("custom_data", customDataFileSchema.parse(next));
  const failed = readings.filter((r) => r.problem).length;
  const read = readings.length - failed;
  return { read, failed, sentence: failed ? `Read ${read} of ${readings.length}; ${failed} could not be read and keep${failed === 1 ? "s" : ""} the last reading.` : `Read ${read}.` };
}

/** The largest picture read for a PDF. */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/**
 * A picture on a thesis read once for its PDF (Hamza, 20 Oct 2026): one GET
 * to its public https address with no cookie and no referrer, through the
 * same checks as a person's own data (the address as written, then every
 * address its name resolves to must be public), no redirect followed, ten
 * seconds and five megabytes at most. Only a PNG or a JPEG, which a PDF can
 * draw, by its first bytes; anything else, or any failure, is null and the
 * PDF names the picture with its page instead. Never logs the address.
 */
export async function publicPicture(address: string): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (checkAddress(address)) return null;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { accept: "image/png, image/jpeg, image/*;q=0.5", "user-agent": "Invariant (a thesis's picture)" }, lookup: publicLookup, timeout: TIMEOUT_MS }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300 || Number(res.headers["content-length"] ?? 0) > MAX_PICTURE_BYTES) {
        res.resume();
        return resolve(null);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_PICTURE_BYTES) {
          req.destroy();
          resolve(null);
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => {
        const data = Buffer.concat(chunks);
        const png = data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const jpg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
        resolve(png ? { data, format: "png" } : jpg ? { data, format: "jpg" } : null);
      });
      res.on("error", () => resolve(null));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => {
      console.warn("[thesis-pdf] a picture could not be read");
      resolve(null);
    });
  });
}
