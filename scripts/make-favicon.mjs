#!/usr/bin/env node
// Renders app/favicon.ico from app/icon.svg: 16, 32 and 48 px as 32-bit BMP entries, the classic
// favicon every fetcher reads (Google's favicon service, which Claude uses for a connector's icon,
// does not take the SVG alone). Run after changing the icon: node scripts/make-favicon.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const svg = readFileSync(process.argv[2] ?? "app/icon.svg");
const sizes = [16, 32, 48];
const images = [];
for (const n of sizes) {
  const { data } = await sharp(svg, { density: 384 }).resize(n, n).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // BITMAPINFOHEADER + BGRA rows bottom-up + 1bpp AND mask (rows padded to 4 bytes).
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0); hdr.writeInt32LE(n, 4); hdr.writeInt32LE(n * 2, 8);
  hdr.writeUInt16LE(1, 12); hdr.writeUInt16LE(32, 14); hdr.writeUInt32LE(0, 16);
  hdr.writeUInt32LE(n * n * 4, 20);
  const px = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const s = (y * n + x) * 4, d = ((n - 1 - y) * n + x) * 4;
    px[d] = data[s + 2]; px[d + 1] = data[s + 1]; px[d + 2] = data[s]; px[d + 3] = data[s + 3];
  }
  const maskRow = Math.ceil(n / 32) * 4;
  const mask = Buffer.alloc(maskRow * n); // all 0: every pixel drawn, alpha decides
  images.push(Buffer.concat([hdr, px, mask]));
}
const dir = Buffer.alloc(6); dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
const entries = []; let offset = 6 + 16 * sizes.length;
sizes.forEach((n, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(n, 0); e.writeUInt8(n, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += images[i].length; entries.push(e);
});
writeFileSync(process.argv[3] ?? "app/favicon.ico", Buffer.concat([dir, ...entries, ...images]));
console.log("wrote", process.argv[3] ?? "app/favicon.ico", offset, "bytes");
