import { decodeHtmlEntities } from "./format";

/**
 * Pure, zero-DOM HTML-to-AST parser for Inner Circle Nepal article bodies.
 *
 * Designed specifically for the newsroom's HTML vocabulary defined in
 * `site/src/lib/sanitize.ts` and styled in `site/src/app/globals.css` (`.copy`).
 * Also handles bare text nodes before the first `<p>` tag (found in live DB rows).
 */

export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  href?: string;
}

export type ArticleBlock =
  | {
      type: "paragraph";
      spans: InlineSpan[];
      variant?: "normal" | "standfirst" | "note";
    }
  | {
      type: "heading";
      level: 2 | 3 | 4;
      spans: InlineSpan[];
    }
  | {
      type: "blockquote";
      spans: InlineSpan[];
      cite?: string;
    }
  | {
      type: "list";
      ordered: boolean;
      items: InlineSpan[][];
    }
  | {
      type: "image";
      src: string;
      alt: string;
      caption?: string;
      wide?: boolean;
    }
  | {
      type: "rule";
    }
  | {
      type: "codeblock";
      code: string;
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    };

const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|tel:|\/)/i;

function isSafeUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  return SAFE_URL_PROTOCOLS.test(trimmed);
}

function getAttr(tagAttrs: string, name: string): string | undefined {
  const regex = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`,
    "i",
  );
  const match = regex.exec(tagAttrs);
  if (!match) return undefined;
  return decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

/**
 * Strip dangerous non-text containers completely (`<script>`, `<style>`, `<iframe>`, etc.)
 * and HTML comments.
 */
export function stripUnsafeContainers(html: string): string {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|textarea|option|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(/<(script|style|textarea|option|noscript|iframe|object|embed)\b[^>]*\/?>/gi, "");
}

/**
 * Parses an HTML fragment containing inline markup (`<strong>`, `<em>`, `<a href>`, `<br>`, etc.)
 * into an array of `InlineSpan` items.
 */
export function parseInlineSpans(rawHtml: string): InlineSpan[] {
  const cleaned = rawHtml.replace(/\r\n/g, "\n");
  const spans: InlineSpan[] = [];

  let bold = 0;
  let italic = 0;
  let underline = 0;
  let strikethrough = 0;
  let code = 0;
  const hrefStack: (string | undefined)[] = [];

  const pushText = (raw: string) => {
    if (!raw) return;
    const decoded = decodeHtmlEntities(raw.replace(/\s+/g, " "));
    if (!decoded) return;

    const currentHref = hrefStack.length > 0 ? hrefStack[hrefStack.length - 1] : undefined;
    const span: InlineSpan = {
      text: decoded,
      ...(bold > 0 ? { bold: true } : {}),
      ...(italic > 0 ? { italic: true } : {}),
      ...(underline > 0 ? { underline: true } : {}),
      ...(strikethrough > 0 ? { strikethrough: true } : {}),
      ...(code > 0 ? { code: true } : {}),
      ...(currentHref ? { href: currentHref } : {}),
    };

    const prev = spans[spans.length - 1];
    if (
      prev &&
      Boolean(prev.bold) === Boolean(span.bold) &&
      Boolean(prev.italic) === Boolean(span.italic) &&
      Boolean(prev.underline) === Boolean(span.underline) &&
      Boolean(prev.strikethrough) === Boolean(span.strikethrough) &&
      Boolean(prev.code) === Boolean(span.code) &&
      prev.href === span.href
    ) {
      prev.text += span.text;
    } else {
      spans.push(span);
    }
  };

  const tagRegex = /<\/?([a-zA-Z0-9]+)\b([^>]*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      pushText(cleaned.slice(lastIndex, match.index));
    }

    const fullTag = match[0];
    const isClosing = fullTag.startsWith("</");
    const tagName = match[1].toLowerCase();
    const attrs = match[2] ?? "";

    if (tagName === "br") {
      spans.push({ text: "\n" });
    } else if (tagName === "strong" || tagName === "b") {
      bold = isClosing ? Math.max(0, bold - 1) : bold + 1;
    } else if (tagName === "em" || tagName === "i") {
      italic = isClosing ? Math.max(0, italic - 1) : italic + 1;
    } else if (tagName === "u") {
      underline = isClosing ? Math.max(0, underline - 1) : underline + 1;
    } else if (tagName === "s" || tagName === "del") {
      strikethrough = isClosing ? Math.max(0, strikethrough - 1) : strikethrough + 1;
    } else if (tagName === "code") {
      code = isClosing ? Math.max(0, code - 1) : code + 1;
    } else if (tagName === "a") {
      if (isClosing) {
        hrefStack.pop();
      } else {
        const href = getAttr(attrs, "href");
        hrefStack.push(isSafeUrl(href) ? href : undefined);
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  if (lastIndex < cleaned.length) {
    pushText(cleaned.slice(lastIndex));
  }

  // Trim leading whitespace on first span and trailing whitespace on last span
  if (spans.length > 0) {
    spans[0].text = spans[0].text.replace(/^[ \t]+/, "");
    const last = spans[spans.length - 1];
    last.text = last.text.replace(/[ \t]+$/, "");
  }

  return spans.filter((s) => s.text.length > 0);
}

function spansHaveText(spans: InlineSpan[]): boolean {
  return spans.some((s) => s.text.trim().length > 0);
}

/**
 * Splits the inside of a `<ul>`/`<ol>` into item fragments.
 *
 * An `</li>` is optional in HTML — the next `<li>` or the end of the list
 * closes the previous item, and browsers have always read it that way. Bodies
 * typed into the newsroom editor rely on that: one live story ends an item
 * with a stray `<ul>` and never closes the `<li>` at all. Requiring `</li>`
 * found no items there and dropped the entire list, taking a sentence of the
 * article with it.
 *
 * So items are cut at `<li>` boundaries instead, and a closing tag is honoured
 * only as the end of the item it closes. A nested list inside an item is
 * flattened into sibling items rather than lost — the markup that produces one
 * is malformed in practice, and keeping the words matters more than the indent.
 */
export function splitListItems(innerHtml: string): string[] {
  const openTag = /<li\b[^>]*>/gi;
  const starts: { contentFrom: number; tagFrom: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = openTag.exec(innerHtml)) !== null) {
    starts.push({ tagFrom: m.index, contentFrom: m.index + m[0].length });
  }
  if (starts.length === 0) return [];

  return starts.map((start, i) => {
    const nextTagFrom = i + 1 < starts.length ? starts[i + 1].tagFrom : innerHtml.length;
    const fragment = innerHtml.slice(start.contentFrom, nextTagFrom);
    // Trim at this item's own `</li>` when it has one; ignore anything after.
    const close = fragment.search(/<\/li\s*>/i);
    return close === -1 ? fragment : fragment.slice(0, close);
  });
}

/**
 * Parses an article HTML body into structured `ArticleBlock` nodes for native rendering.
 */
export function parseArticleHtml(rawHtml: string): ArticleBlock[] {
  const safeHtml = stripUnsafeContainers(rawHtml);
  if (!safeHtml.trim()) return [];

  const blocks: ArticleBlock[] = [];

  // Tokenize top-level block elements while capturing any bare text between them
  const blockPattern =
    /<(figure|blockquote|ul|ol|table|pre|h[1-4]|p|hr|img)\b([^>]*)>([\s\S]*?)<\/\1>|<(hr|img)\b([^>]*)\/?>/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushLooseContent = (segment: string) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    // Split loose paragraphs separated by double newlines
    const paragraphs = trimmed.split(/\r?\n\s*\r?\n/);
    for (const para of paragraphs) {
      const spans = parseInlineSpans(para);
      if (spansHaveText(spans)) {
        blocks.push({ type: "paragraph", spans, variant: "normal" });
      }
    }
  };

  while ((match = blockPattern.exec(safeHtml)) !== null) {
    if (match.index > lastIndex) {
      pushLooseContent(safeHtml.slice(lastIndex, match.index));
    }

    const pairedTag = match[1]?.toLowerCase();
    const pairedAttrs = match[2] ?? "";
    const innerHtml = match[3] ?? "";
    const voidTag = match[4]?.toLowerCase();
    const voidAttrs = match[5] ?? "";

    const tag = pairedTag || voidTag;
    const attrs = pairedTag ? pairedAttrs : voidAttrs;

    if (tag === "hr") {
      blocks.push({ type: "rule" });
    } else if (tag === "img") {
      const src = getAttr(attrs, "src");
      if (src && isSafeUrl(src)) {
        const alt = getAttr(attrs, "alt") ?? "";
        const cls = getAttr(attrs, "class") ?? "";
        blocks.push({
          type: "image",
          src,
          alt,
          wide: /\bwide\b/.test(cls),
        });
      }
    } else if (tag === "figure") {
      const imgMatch = /<img\b([^>]*)\/?>/i.exec(innerHtml);
      if (imgMatch) {
        const imgAttrs = imgMatch[1] ?? "";
        const src = getAttr(imgAttrs, "src");
        if (src && isSafeUrl(src)) {
          const alt = getAttr(imgAttrs, "alt") ?? "";
          const figCaptionMatch = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(innerHtml);
          const caption = figCaptionMatch
            ? parseInlineSpans(figCaptionMatch[1])
                .map((s) => s.text)
                .join("")
                .trim()
            : undefined;
          const figClass = `${getAttr(attrs, "class") ?? ""} ${getAttr(imgAttrs, "class") ?? ""}`;
          blocks.push({
            type: "image",
            src,
            alt,
            caption: caption || undefined,
            wide: /\bwide\b/.test(figClass),
          });
        }
      }
    } else if (tag === "p") {
      // Check if paragraph contains a standalone image
      const imgMatch = /^(\s*)<img\b([^>]*)\/?>(\s*)$/i.exec(innerHtml);
      if (imgMatch) {
        const src = getAttr(imgMatch[2] ?? "", "src");
        if (src && isSafeUrl(src)) {
          blocks.push({
            type: "image",
            src,
            alt: getAttr(imgMatch[2] ?? "", "alt") ?? "",
          });
        }
      } else {
        const spans = parseInlineSpans(innerHtml);
        if (spansHaveText(spans)) {
          const cls = getAttr(attrs, "class") ?? "";
          const variant = /\bstandfirst\b/.test(cls)
            ? "standfirst"
            : /\bnote\b/.test(cls)
              ? "note"
              : "normal";
          blocks.push({ type: "paragraph", spans, variant });
        }
      }
    } else if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      const spans = parseInlineSpans(innerHtml);
      if (spansHaveText(spans)) {
        const level = tag === "h3" ? 3 : tag === "h4" ? 4 : 2;
        blocks.push({ type: "heading", level, spans });
      }
    } else if (tag === "blockquote") {
      let citeText = getAttr(attrs, "cite");
      let quoteInner = innerHtml;
      const citeMatch = /<cite\b[^>]*>([\s\S]*?)<\/cite>/i.exec(quoteInner);
      if (citeMatch) {
        citeText = parseInlineSpans(citeMatch[1])
          .map((s) => s.text)
          .join("")
          .trim();
        quoteInner = quoteInner.replace(citeMatch[0], "");
      }
      // Strip inner `<p>` tags inside blockquote while preserving line breaks
      quoteInner = quoteInner
        .replace(/<\/p>\s*<p\b[^>]*>/gi, "<br><br>")
        .replace(/<\/?p\b[^>]*>/gi, "");
      const spans = parseInlineSpans(quoteInner);
      if (spansHaveText(spans)) {
        blocks.push({
          type: "blockquote",
          spans,
          cite: citeText || undefined,
        });
      }
    } else if (tag === "ul" || tag === "ol") {
      const items: InlineSpan[][] = [];
      for (const raw of splitListItems(innerHtml)) {
        const itemSpans = parseInlineSpans(raw.replace(/<\/?p\b[^>]*>/gi, ""));
        if (spansHaveText(itemSpans)) {
          items.push(itemSpans);
        }
      }
      if (items.length > 0) {
        blocks.push({
          type: "list",
          ordered: tag === "ol",
          items,
        });
      }
    } else if (tag === "pre") {
      const codeInner = innerHtml.replace(/<\/?code\b[^>]*>/gi, "");
      const decoded = decodeHtmlEntities(codeInner).trim();
      if (decoded) {
        blocks.push({ type: "codeblock", code: decoded });
      }
    } else if (tag === "table") {
      const headers: string[] = [];
      const rows: string[][] = [];
      const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch: RegExpExecArray | null;
      while ((trMatch = trRegex.exec(innerHtml)) !== null) {
        const rowHtml = trMatch[1];
        const thCells: string[] = [];
        const tdCells: string[] = [];

        const thRegex = /<th\b[^>]*>([\s\S]*?)<\/th>/gi;
        let thMatch: RegExpExecArray | null;
        while ((thMatch = thRegex.exec(rowHtml)) !== null) {
          thCells.push(
            parseInlineSpans(thMatch[1])
              .map((s) => s.text)
              .join("")
              .trim(),
          );
        }

        const tdRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch: RegExpExecArray | null;
        while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
          tdCells.push(
            parseInlineSpans(tdMatch[1])
              .map((s) => s.text)
              .join("")
              .trim(),
          );
        }

        if (thCells.length > 0 && headers.length === 0 && rows.length === 0) {
          headers.push(...thCells);
        } else if (thCells.length > 0 || tdCells.length > 0) {
          rows.push([...thCells, ...tdCells]);
        }
      }

      if (headers.length > 0 || rows.length > 0) {
        blocks.push({ type: "table", headers, rows });
      }
    }

    lastIndex = blockPattern.lastIndex;
  }

  if (lastIndex < safeHtml.length) {
    pushLooseContent(safeHtml.slice(lastIndex));
  }

  return blocks;
}
