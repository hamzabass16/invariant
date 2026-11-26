import "server-only";

import { inflateRawSync } from "node:zlib";

/**
 * The files of a zip, read in memory: the SEC's quarterly data sets and an
 * Excel workbook are zips. Stored and deflated entries alone (all the SEC
 * and Excel write); no zip64, no encryption. A file over `maxBytes` once
 * inflated is refused, never cut. Throws on anything else, so a document
 * that cannot be read never looks empty.
 */
export function unzip(bytes: Uint8Array, wanted: (name: string) => boolean, maxBytes = 200 * 1024 * 1024): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("bad central directory");
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    if (packed === 0xffffffff || size === 0xffffffff) throw new Error("zip64 is not read");
    if (size > maxBytes) throw new Error("entry too large");
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error("bad local header");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + packed);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, new Uint8Array(inflateRawSync(data, { maxOutputLength: maxBytes })));
    else throw new Error("unknown compression");
  }
  return out;
}
