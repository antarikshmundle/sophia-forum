import { normalizeText } from "./text.ts";
import { extractLinks } from "./schema.ts";

/**
 * Splits Markdown content into retrieval chunks. A chunk never crosses a heading, so each one keeps its heading path
 * ("Admissions › Documents required") as context. Paragraphs are packed up to `maxChars`; a longer paragraph is split
 * at sentence ends (including the Devanagari danda ।), and only as a last resort at a space. Every chunk lists the links
 * its own text contains, so a citation can point at them. Deterministic: the same content gives the same chunks.
 */

export const DEFAULT_MAX_CHUNK_CHARS = 1200;

export interface TextChunk {
  heading: string;
  text: string;
  links: string[];
}

function splitLong(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const out: string[] = [];
  let current = "";
  const push = () => { if (current) out.push(current); current = ""; };
  for (const sentence of paragraph.split(/(?<=[.!?।])\s+/)) {
    if (sentence.length > maxChars) {
      push();
      let rest = sentence;
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf(" ", maxChars);
        const at = cut > maxChars / 2 ? cut : maxChars;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest;
    } else if (!current) current = sentence;
    else if (current.length + 1 + sentence.length <= maxChars) current += " " + sentence;
    else { push(); current = sentence; }
  }
  push();
  return out;
}

export function chunkMarkdown(content: string, maxChars: number = DEFAULT_MAX_CHUNK_CHARS): TextChunk[] {
  const lines = normalizeText(content).split("\n");
  const sections: { heading: string; paragraphs: string[] }[] = [];
  const path: string[] = [];
  let section = { heading: "", paragraphs: [] as string[] };
  let paragraph: string[] = [];
  const endParagraph = () => { if (paragraph.length) section.paragraphs.push(paragraph.join("\n")); paragraph = []; };
  const endSection = () => { endParagraph(); if (section.paragraphs.length) sections.push(section); };

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (h) {
      endSection();
      path.length = Math.min(path.length, h[1].length - 1);
      path[h[1].length - 1] = h[2];
      section = { heading: path.filter(Boolean).join(" › "), paragraphs: [] };
    } else if (!line) endParagraph();
    else paragraph.push(line);
  }
  endSection();

  const chunks: TextChunk[] = [];
  for (const s of sections) {
    let current = "";
    const push = () => { if (current) chunks.push({ heading: s.heading, text: current, links: extractLinks(current) }); current = ""; };
    for (const p of s.paragraphs.flatMap((x) => splitLong(x, maxChars))) {
      if (!current) current = p;
      else if (current.length + 2 + p.length <= maxChars) current += "\n\n" + p;
      else { push(); current = p; }
    }
    push();
  }
  return chunks;
}
