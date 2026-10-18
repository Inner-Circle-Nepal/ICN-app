import { parseArticleHtml, type ArticleBlock } from "./htmlParser";

/**
 * Turning an article into something a speech engine can read aloud.
 *
 * Two problems to solve. First, the device TTS engines cap a single
 * utterance — `Speech.maxSpeechInputLength` is around four thousand
 * characters on Android — and a news article is routinely longer, so the text
 * has to be broken up and spoken in sequence. Second, a naive split lands
 * mid-sentence and the listener hears an audible seam, so breaks are placed
 * at sentence ends wherever one is available.
 *
 * Nepali sentences end with a danda (।), not a full stop, which the sentence
 * splitter has to know or every Nepali article becomes one unbroken chunk.
 */

/** Conservative default; the caller passes the engine's real limit. */
export const DEFAULT_CHUNK_LIMIT = 3800;

/**
 * Flatten parsed article blocks into the text a listener should hear.
 *
 * Headings get a trailing stop so the engine pauses after them. Tables, code
 * blocks and rules are skipped: reading a table aloud cell by cell is worse
 * than silence, and a listener is better served by being told to look.
 */
export function narrationTextFromBlocks(blocks: ArticleBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const text = block.spans.map((s) => s.text).join("").trim();
        if (text) parts.push(/[.!?।]$/.test(text) ? text : `${text}.`);
        break;
      }
      case "paragraph":
      case "blockquote": {
        const text = block.spans.map((s) => s.text).join("").trim();
        if (text) parts.push(text);
        break;
      }
      case "list": {
        for (const item of block.items) {
          const text = item.map((s) => s.text).join("").trim();
          if (text) parts.push(/[.!?।]$/.test(text) ? text : `${text}.`);
        }
        break;
      }
      case "image": {
        if (block.caption?.trim()) parts.push(block.caption.trim());
        break;
      }
      default:
        break;
    }
  }

  return parts.join("\n\n");
}

export function narrationTextFromHtml(html: string): string {
  return narrationTextFromBlocks(parseArticleHtml(html));
}

/**
 * Split text into sentences, understanding both `.` and the Devanagari danda.
 *
 * Abbreviations will occasionally cause a false break. That costs a short
 * pause in the middle of a sentence, which is a far smaller defect than a
 * chunk boundary landing mid-word, so the simple rule is the right one here.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Group text into utterances no longer than `limit` characters.
 *
 * A sentence longer than the limit on its own — a run-on quote, a list
 * rendered as one line — is hard-split on whitespace rather than dropped,
 * because silently losing a paragraph of a news report is not an option.
 */
export function chunkForSpeech(text: string, limit = DEFAULT_CHUNK_LIMIT): string[] {
  const safeLimit = Math.max(200, limit);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const sentence of splitSentences(text)) {
    if (sentence.length > safeLimit) {
      push();
      let rest = sentence;
      while (rest.length > safeLimit) {
        const window = rest.slice(0, safeLimit);
        const cut = window.lastIndexOf(" ");
        const at = cut > safeLimit * 0.5 ? cut : safeLimit;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) current = rest;
      continue;
    }

    if (current.length + sentence.length + 1 > safeLimit) push();
    current = current ? `${current} ${sentence}` : sentence;
  }

  push();
  return chunks;
}

/**
 * BCP 47 tag for the device speech engine.
 *
 * `ne-NP` is not installed on every handset. The hook checks the available
 * voices and falls back rather than letting the engine read Devanagari with
 * an English voice, which produces nonsense rather than an accent.
 */
export function speechLanguageTag(language: "en" | "ne"): string {
  return language === "ne" ? "ne-NP" : "en-US";
}
