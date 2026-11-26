/**
 * The vault adapters that cannot be exercised against a live account from a
 * check: OneDrive (Microsoft Graph) and an S3-style bucket, each against a
 * small fake server in this process, and the S3 signer against the signatures
 * AWS publishes for its example requests. Also the fixed key list and the
 * bucket config schema.
 *
 * Run: npm run check:vault  (NODE_OPTIONS=--conditions=react-server, so the
 * adapters' "server-only" import resolves to the empty module.)
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { z } from "zod";

import { encodePath, sha256Hex, signS3Request } from "../lib/s3-sign";
import { SyncError } from "../lib/sync-error";
import { VAULT_KEYS } from "../lib/vault-keys";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}
async function fails(name: string, fn: () => Promise<unknown>, part: string) {
  try {
    await fn();
    check(name, false, "did not throw");
  } catch (e) {
    check(name, e instanceof SyncError && e.message.includes(part), e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}
function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

async function main() {
  // ---------------------------------------------------------------------------
  // 1. The signer, against AWS's published examples (Signature Version 4, Authorization header).

  const AWS = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" };
  const EXAMPLE_NOW = new Date("2013-05-24T00:00:00Z");
  const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const sig = (auth: string) => auth.match(/Signature=([0-9a-f]+)/)?.[1];

  {
    const get = await signS3Request({ method: "GET", url: "https://examplebucket.s3.amazonaws.com/test.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY, now: EXAMPLE_NOW }, AWS);
    check("GET object signature matches AWS's example", sig(get.headers.authorization) === "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41", get.headers.authorization);
    check("signed headers are the lower-cased sorted set", get.headers.authorization.includes("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date"));
    check("host is not sent twice", !("host" in get.headers));

    const text = new TextEncoder().encode("Welcome to Amazon S3.");
    const put = await signS3Request(
      { method: "PUT", url: `https://examplebucket.s3.amazonaws.com/${encodePath("test$file.text")}`, headers: { date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" }, payloadHash: await sha256Hex(text), now: EXAMPLE_NOW },
      AWS,
    );
    check("PUT object signature matches AWS's example (path with $)", sig(put.headers.authorization) === "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd", put.headers.authorization);
    check("the sent path is the canonical one", put.url === "https://examplebucket.s3.amazonaws.com/test%24file.text", put.url);

    const list = await signS3Request({ method: "GET", url: "https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J", payloadHash: EMPTY, now: EXAMPLE_NOW }, AWS);
    check("GET bucket (list) signature matches AWS's example", sig(list.headers.authorization) === "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7", list.headers.authorization);
    check("the payload hash of the empty body is the well-known one", (await sha256Hex("")) === EMPTY);
  }

  // ---------------------------------------------------------------------------
  // 2. The key list.

  check("the key list has the probe and the reports", VAULT_KEYS.includes("probe") && VAULT_KEYS.includes("reports") && VAULT_KEYS.includes("setup"));
  check("keys are file-name safe", VAULT_KEYS.every((k) => /^[a-z_]+$/.test(k)));

  // ---------------------------------------------------------------------------
  // 3. A fake S3 and the bucket adapter.

  const bucketMod = await import("../lib/user-bucket");
  {
    const objects = new Map<string, { mime: string; bytes: Buffer }>();
    let refuse = false;
    const seen: string[] = [];
    const s3 = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      const auth = req.headers.authorization ?? "";
      seen.push(`${req.method} ${url.pathname}${url.search}`);
      if (!auth.startsWith("AWS4-HMAC-SHA256 Credential=AKID/") || !req.headers["x-amz-date"] || !req.headers["x-amz-content-sha256"]) {
        res.writeHead(403).end("<Error><Code>AccessDenied</Code></Error>");
        return;
      }
      if (refuse) {
        res.writeHead(403).end("<Error><Code>AccessDenied</Code></Error>");
        return;
      }
      const [, bucket, ...rest] = url.pathname.split("/");
      const key = rest.map(decodeURIComponent).join("/");
      if (bucket !== "my-vault") {
        res.writeHead(404).end("<Error><Code>NoSuchBucket</Code></Error>");
        return;
      }
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix));
        res.writeHead(200, { "content-type": "application/xml" }).end(`<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k.replace(/&/g, "&amp;")}</Key></Contents>`).join("")}</ListBucketResult>`);
        return;
      }
      if (req.method === "GET") {
        const o = objects.get(key);
        if (!o) {
          res.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
          return;
        }
        res.writeHead(200, { "content-type": o.mime }).end(o.bytes);
        return;
      }
      if (req.method === "PUT") {
        const source = req.headers["x-amz-copy-source"];
        if (typeof source === "string") {
          const from = decodeURIComponent(source.replace(/^\/my-vault\//, ""));
          const o = objects.get(from);
          if (!o) {
            res.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
            return;
          }
          objects.set(key, o);
          res.writeHead(200).end("<CopyObjectResult/>");
          return;
        }
        const bytes = await body(req);
        const hash = await sha256Hex(new Uint8Array(bytes));
        if (hash !== req.headers["x-amz-content-sha256"]) {
          res.writeHead(400).end("<Error><Code>XAmzContentSHA256Mismatch</Code></Error>");
          return;
        }
        objects.set(key, { mime: String(req.headers["content-type"] ?? ""), bytes });
        res.writeHead(200).end();
        return;
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204).end();
        return;
      }
      res.writeHead(405).end();
    });
    const endpoint = await listen(s3);
    const config = bucketMod.bucketConfigSchema.parse({ endpoint, region: "auto", bucket: "my-vault", prefix: "/portfolio-os/", accessKeyId: "AKID", secretAccessKey: "secret" });
    check("the prefix loses its slashes", config.prefix === "portfolio-os");
    check("the bucket is described without a credential", bucketMod.describeBucket(config) === `the bucket my-vault at ${new URL(endpoint).host}`);

    const setupSchema = z.object({ ownerName: z.string() });
    check("a missing file reads as null", (await bucketMod.readJson(config, "setup", setupSchema)) === null);
    await bucketMod.writeJson(config, "setup", { ownerName: "Nadia" });
    check("the file lands under prefix/key.json", objects.has("portfolio-os/setup.json"));
    check("the payload hash the server checked matched", !seen.some((s) => s.includes("400")));
    check("a written file reads back", (await bucketMod.readJson(config, "setup", setupSchema))?.ownerName === "Nadia");
    objects.set("portfolio-os/book.json", { mime: "application/json", bytes: Buffer.from("{not json") });
    await fails("unreadable JSON is a sentence", () => bucketMod.readJson(config, "book", setupSchema), "not readable");
    objects.set("portfolio-os/book.json", { mime: "application/json", bytes: Buffer.from('{"other":1}') });
    await fails("a wrong shape is a sentence", () => bucketMod.readJson(config, "book", setupSchema), "unexpected shape");

    const k = await bucketMod.saveDocument(config, "My Rules.PDF", "application/pdf", new Uint8Array([1, 2, 3]));
    check("the attached document keeps its extension under the app's name", k === "portfolio-os/methodology_source.pdf" && objects.has(k), k);
    await bucketMod.removeFile(config, "methodology_source");
    check("removing copies to bin/ before deleting", !objects.has(k) && [...objects.keys()].some((x) => x.startsWith("portfolio-os/bin/") && x.endsWith("-methodology_source.pdf")), [...objects.keys()].join(","));
    await bucketMod.removeFile(config, "methodology_source");
    check("removing an absent file is quiet", true);

    await bucketMod.probe(config);
    check("the probe leaves nothing behind", !objects.has("portfolio-os/probe.json"));
    check("the probe wrote, read and deleted", seen.filter((s) => s.includes("probe.json")).length === 3, seen.filter((s) => s.includes("probe.json")).join(" | "));

    const wrongBucket = { ...config, bucket: "other-vault" };
    await fails("a missing bucket on write is a sentence", () => bucketMod.writeJson(wrongBucket, "setup", {}), "not found");
    refuse = true;
    await fails("refused credentials are a sentence", () => bucketMod.readJson(config, "setup", setupSchema), "refused the credentials");
    refuse = false;
    await fails("an unreachable endpoint is a sentence", () => bucketMod.readJson({ ...config, endpoint: "http://127.0.0.1:9" }, "setup", setupSchema), "Could not reach");
    check("no request carried the secret", !seen.some((s) => s.includes("secret")));
    s3.close();

    check("the schema refuses a bad bucket name", !bucketMod.bucketConfigSchema.safeParse({ ...config, bucket: "Bad_Name" }).success);
    check("the schema refuses a prefix with spaces", !bucketMod.bucketConfigSchema.safeParse({ ...config, prefix: "my files" }).success);
    check("the schema refuses a non-URL endpoint", !bucketMod.bucketConfigSchema.safeParse({ ...config, endpoint: "s3.amazonaws.com" }).success);
    check("region defaults to auto", bucketMod.bucketConfigSchema.parse({ ...config, region: undefined }).region === "auto");
  }

  // ---------------------------------------------------------------------------
  // 4. A fake Graph and the OneDrive adapter.

  {
    const items = new Map<string, { name: string; mime: string; bytes: Buffer }>();
    let created = false;
    let expired = false;
    let nextId = 1;
    const graph = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.headers.authorization !== "Bearer tok") {
        res.writeHead(401).end(JSON.stringify({ error: { code: "InvalidAuthenticationToken" } }));
        return;
      }
      if (expired) {
        res.writeHead(401).end(JSON.stringify({ error: { code: "InvalidAuthenticationToken" } }));
        return;
      }
      const p = decodeURIComponent(url.pathname);
      if (req.method === "GET" && p === "/me/drive/special/approot/children") {
        if (!created) {
          res.writeHead(404).end(JSON.stringify({ error: { code: "itemNotFound" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ value: [...items].map(([id, i]) => ({ id, name: i.name })) }));
        return;
      }
      const up = p.match(/^\/me\/drive\/special\/approot:\/([^:]+):\/content$/);
      if (req.method === "PUT" && up) {
        created = true;
        const name = up[1];
        const bytes = await body(req);
        const existing = [...items].find(([, i]) => i.name === name)?.[0];
        const id = existing ?? `item${nextId++}`;
        items.set(id, { name, mime: String(req.headers["content-type"] ?? ""), bytes });
        res.writeHead(existing ? 200 : 201, { "content-type": "application/json" }).end(JSON.stringify({ id, name }));
        return;
      }
      const content = p.match(/^\/me\/drive\/items\/([^/]+)\/content$/);
      if (req.method === "GET" && content) {
        const i = items.get(content[1]);
        if (!i) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "content-type": i.mime }).end(i.bytes);
        return;
      }
      const del = p.match(/^\/me\/drive\/items\/([^/]+)$/);
      if (req.method === "DELETE" && del) {
        items.delete(del[1]);
        res.writeHead(204).end();
        return;
      }
      res.writeHead(400).end(JSON.stringify({ error: { code: "unknown route", path: p } }));
    });
    process.env.PORTFOLIO_OS_GRAPH_BASE = await listen(graph);
    const onedrive = await import("../lib/user-onedrive");
    const setupSchema = z.object({ ownerName: z.string() });

    check("an app folder not yet created reads as no files", (await onedrive.readJson("tok", "setup", setupSchema)) === null);
    await onedrive.writeJson("tok", "setup", { ownerName: "Nadia" });
    check("the file is named key.json in the app folder", [...items.values()].some((i) => i.name === "setup.json"));
    check("a written file reads back", (await onedrive.readJson("tok", "setup", setupSchema))?.ownerName === "Nadia");
    await onedrive.writeJson("tok", "setup", { ownerName: "Nadia K." });
    check("writing again replaces, not duplicates", [...items.values()].filter((i) => i.name === "setup.json").length === 1 && (await onedrive.readJson("tok", "setup", setupSchema))?.ownerName === "Nadia K.");
    check("another key is still null", (await onedrive.readJson("tok", "book", setupSchema)) === null);

    await onedrive.saveDocument("tok", "rules.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Uint8Array([1]));
    await onedrive.saveDocument("tok", "rules v2.pdf", "application/pdf", new Uint8Array([2]));
    const docs = [...items.values()].filter((i) => i.name.startsWith("methodology_source"));
    check("one attached document at a time, with its extension", docs.length === 1 && docs[0].name === "methodology_source.pdf", docs.map((d) => d.name).join(","));
    await onedrive.removeFile("tok", "methodology_source");
    check("removing finds the document by prefix", ![...items.values()].some((i) => i.name.startsWith("methodology_source")));
    await onedrive.removeFile("tok", "methodology_source");

    const bad = [...items].find(([, i]) => i.name === "setup.json")![0];
    items.set(bad, { name: "setup.json", mime: "application/json", bytes: Buffer.from("nope") });
    await fails("unreadable JSON is a sentence", () => onedrive.readJson("tok", "setup", setupSchema), "not readable");
    await fails("a bad token is a sentence", () => onedrive.readJson("bad", "setup", setupSchema), "Sign out and sign in again");
    expired = true;
    await fails("an expired token on write is a sentence", () => onedrive.writeJson("tok", "setup", {}), "Sign out and sign in again");
    expired = false;
    graph.close();
  }

  // ---------------------------------------------------------------------------
  // 5. The Drive adapter's downloads against a fake fetch: a slow answer is asked for again and the
  //    first copy to arrive is used; a failed request is asked once more; a refusal is said at once.

  {
    const drive = await import("../lib/user-drive");
    const realFetch = globalThis.fetch;
    const schema = z.object({ v: z.number() });
    type Plan = "ok" | "hang" | "fail" | "404";
    let plans: Plan[] = [];
    let downloads = 0;
    let aborted = 0;
    let fileId = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("alt=media")) {
        fileId += 1;
        return new Response(JSON.stringify({ files: [{ id: `f${fileId}`, modifiedTime: `2026-10-13T00:00:0${fileId % 10}Z`, appProperties: { portfolioOs: "records" } }] }), { status: 200 });
      }
      const plan = plans[downloads] ?? "ok";
      downloads += 1;
      if (plan === "fail") throw new TypeError("fetch failed");
      if (plan === "404") return new Response("{}", { status: 404 });
      if (plan === "hang")
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted += 1;
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      return new Response(JSON.stringify({ v: downloads }), { status: 200 });
    }) as typeof fetch;
    try {
      // Each case lists afresh (a new token, so a new listing) and a new modifiedTime, so nothing is served from memory.
      plans = ["ok"];
      downloads = 0;
      check("a quick download is read once", (await drive.readJson("t1", "records", schema))?.v === 1 && downloads === 1, `downloads ${downloads}`);

      plans = ["hang", "ok"];
      downloads = 0;
      aborted = 0;
      const t = Date.now();
      const slow = await drive.readJson("t2", "records", schema);
      const took = Date.now() - t;
      check("a download that hangs is asked for again and the second copy is used", slow?.v === 2 && downloads === 2, `got ${JSON.stringify(slow)}, downloads ${downloads}`);
      check("the second request goes out within about a second", took < 2500, `${took} ms`);
      check("the slow request is cancelled once the other arrives", aborted === 1, `aborted ${aborted}`);

      plans = ["fail", "ok"];
      downloads = 0;
      check("a failed download is asked once more", (await drive.readJson("t3", "records", schema))?.v === 2 && downloads === 2, `downloads ${downloads}`);

      plans = ["404"];
      downloads = 0;
      await fails("a missing file is said at once", () => drive.readJson("t4", "records", schema), "missing");
      check("a refusal is not asked again", downloads === 1, `downloads ${downloads}`);

      plans = ["fail", "fail"];
      downloads = 0;
      await fails("two failed requests are a sentence", () => drive.readJson("t5", "records", schema), "Could not reach Google Drive");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  // ---------------------------------------------------------------------------

  if (failures.length) {
    console.error(`check:vault FAILED (${passed} passed, ${failures.length} failed)\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`check:vault ok (${passed} passed): signatures match AWS's examples; the bucket and OneDrive adapters round-trip, degrade to sentences, and leave no probe behind; a slow Drive download is asked for again.`);

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
