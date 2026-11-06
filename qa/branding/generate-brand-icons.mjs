// Generates the browser icons from the official Sophia Forum logo (public/images/sophia-forum-logo.png, supplied by the
// owner 2026-11-04). Nothing is redrawn or recoloured: every icon is the original pixels, resized.
//   - public/favicon.ico (16, 32, 48 px): the central Sophia mark, cut straight from the original at its exact bounding
//     box (the full shield is unreadable at tab size), centred on a transparent square.
//   - public/apple-touch-icon.png (180 px): the full logo, proportions kept, on transparent padding.
//   node qa/branding/generate-brand-icons.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sharp = createRequire(resolve(ROOT, "package.json"))("sharp");
const SOURCE = resolve(ROOT, "public/images/sophia-forum-logo.png");
const SOURCE_SHA256 = "642a07d6cc41141d30ec7d5524763566598dd00fe4de451264cd84231d64b59b";
// the head-and-network mark inside the shield, measured on the 1022×1177 original (no lettering inside this box)
const MARK = { left: 354, top: 324, width: 320, height: 406 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const sha = createHash("sha256").update(readFileSync(SOURCE)).digest("hex");
if (sha !== SOURCE_SHA256) { console.error(`REFUSED: ${SOURCE} is not the approved logo (sha256 ${sha}).`); process.exit(1); }
const meta = await sharp(SOURCE).metadata();
if (meta.width !== 1022 || meta.height !== 1177 || !meta.hasAlpha) { console.error("REFUSED: unexpected logo dimensions or no transparency."); process.exit(1); }

// favicon: the mark, centred on a transparent square, resized with Lanczos
const side = Math.max(MARK.width, MARK.height);
const mark = await sharp(SOURCE).extract(MARK).png().toBuffer();
const markSquare = await sharp({ create: { width: side, height: side, channels: 4, background: CLEAR } })
  .composite([{ input: mark, left: Math.round((side - MARK.width) / 2), top: Math.round((side - MARK.height) / 2) }])
  .png()
  .toBuffer();
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => sharp(markSquare).resize(s, s, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer()));

// ICO container with PNG-encoded images (supported by every current browser)
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e); header.writeUInt8(s, e + 1); header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync(resolve(ROOT, "public/favicon.ico"), Buffer.concat([header, ...pngs]));

// Apple touch icon: the full logo, contained (never stretched) in 180×180 with a small transparent margin
const inner = await sharp(SOURCE).resize(164, 164, { fit: "contain", background: CLEAR, kernel: "lanczos3" }).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: CLEAR } })
  .composite([{ input: inner, left: 8, top: 8 }])
  .png({ compressionLevel: 9 })
  .toFile(resolve(ROOT, "public/apple-touch-icon.png"));

console.log(`favicon.ico: ${sizes.join(", ")} px (Sophia mark); apple-touch-icon.png: 180 px (full logo)`);
