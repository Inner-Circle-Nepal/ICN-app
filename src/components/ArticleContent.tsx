import React, { useMemo, useState } from "react";
import {
  Linking,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import {
  parseArticleHtml,
  type ArticleBlock,
  type InlineSpan,
} from "@/utils/htmlParser";
import { deepLinkToRouterPath, resolveDeepLink } from "@/utils/deepLinks";
import { IMAGE_WIDTHS, sizedImageUrl } from "@/utils/images";

/**
 * Long-form native article body renderer.
 *
 * Mirrors `.copy` in `site/src/app/globals.css`:
 *   - Body typography in Newsreader 400 (or Mukta 400 for Devanagari)
 *   - Raised editorial initial on the opening paragraph (for Latin script)
 *   - h2 / h3 / h4 section headings in Newsreader 500
 *   - Rule-bounded pull quotes (`borderTop: 1px ink`, `borderBottom: 1px rule`)
 *   - Unordered lists with custom horizontal dash markers (`1px` ink line)
 *     and ordered lists with tabular sans numbers
 *   - Inline figures with `expo-image` and `figcaption`
 *   - Tables, code blocks, and hairlines
 *   - In-app deep-link resolution for `icn.news` links, and system browser
 *     for external links.
 */

interface ArticleContentProps {
  html: string;
  isNepali?: boolean;
}

export function ArticleContent({ html, isNepali = false }: ArticleContentProps) {
  const router = useRouter();
  const { palette } = useTheme();

  const blocks = useMemo(() => parseArticleHtml(html), [html]);

  const handleLinkPress = async (href: string) => {
    const resolved = resolveDeepLink(href);
    if (resolved && resolved.type !== "external") {
      const path = deepLinkToRouterPath(resolved);
      if (path) {
        router.push(path);
        return;
      }
    }

    if (href.startsWith("mailto:") || href.startsWith("tel:")) {
      void Linking.openURL(href).catch(() => {});
      return;
    }

    const targetUrl =
      resolved?.type === "external" ? resolved.url : href;
    try {
      await WebBrowser.openBrowserAsync(targetUrl);
    } catch {
      void Linking.openURL(targetUrl).catch(() => {});
    }
  };

  /*
   * Which paragraph carries the raised initial, decided up front.
   *
   * This was tracked with a `let` flipped inside the render loop — a mutation
   * during render, and the kind of thing that silently stops working once
   * rendering is interrupted or replayed. The answer only depends on the
   * parsed blocks, so it is computed from them instead.
   */
  const openingParagraphIndex = useMemo(
    () => blocks.findIndex((b) => b.type === "paragraph" && b.variant === "normal"),
    [blocks],
  );

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          const isOpening = index === openingParagraphIndex;
          return (
            <ParagraphBlock
              key={`p-${index}`}
              block={block}
              isOpening={isOpening && !isNepali}
              isNepali={isNepali}
              onLinkPress={handleLinkPress}
            />
          );
        }

        if (block.type === "heading") {
          return (
            <HeadingBlock
              key={`h-${index}`}
              block={block}
              isNepali={isNepali}
              onLinkPress={handleLinkPress}
            />
          );
        }

        if (block.type === "blockquote") {
          return (
            <BlockquoteBlock
              key={`bq-${index}`}
              block={block}
              isNepali={isNepali}
              onLinkPress={handleLinkPress}
            />
          );
        }

        if (block.type === "list") {
          return (
            <ListBlock
              key={`list-${index}`}
              block={block}
              isNepali={isNepali}
              onLinkPress={handleLinkPress}
            />
          );
        }

        if (block.type === "image") {
          return <InlineFigureBlock key={`img-${index}`} block={block} />;
        }

        if (block.type === "rule") {
          return (
            <View
              key={`hr-${index}`}
              style={[styles.hr, { backgroundColor: palette.rule }]}
            />
          );
        }

        if (block.type === "codeblock") {
          return (
            <View
              key={`code-${index}`}
              style={[
                styles.codeBlock,
                { backgroundColor: palette.paper2, borderColor: palette.rule },
              ]}
            >
              <Text style={[styles.codeBlockText, { color: palette.ink }]}>
                {block.code}
              </Text>
            </View>
          );
        }

        if (block.type === "table") {
          return <TableBlock key={`tbl-${index}`} block={block} />;
        }

        return null;
      })}
    </View>
  );
}

function renderInlineSpans(
  spans: InlineSpan[],
  baseStyle: TextStyle,
  palette: ReturnType<typeof useTheme>["palette"],
  isNepali: boolean,
  onLinkPress: (href: string) => void,
) {
  return spans.map((span, idx) => {
    const fontFamily = isNepali
      ? span.bold
        ? fontFamilies.devaMedium
        : fontFamilies.devaRegular
      : span.bold
        ? fontFamilies.serifMedium
        : span.italic
          ? fontFamilies.serifItalic
          : fontFamilies.serifRegular;

    const spanStyle: TextStyle = {
      ...baseStyle,
      fontFamily,
      fontWeight: span.bold ? "500" : "400",
      fontStyle: span.italic ? "italic" : "normal",
      textDecorationLine:
        span.href || span.underline
          ? span.strikethrough
            ? "underline line-through"
            : "underline"
          : span.strikethrough
            ? "line-through"
            : "none",
      color: span.href ? palette.ink : baseStyle.color,
      backgroundColor: span.code ? palette.paper2 : undefined,
    };

    if (span.href) {
      const href = span.href;
      return (
        <Text
          key={idx}
          style={spanStyle}
          onPress={() => onLinkPress(href)}
          accessibilityRole="link"
        >
          {span.text}
        </Text>
      );
    }

    return (
      <Text key={idx} style={spanStyle}>
        {span.text}
      </Text>
    );
  });
}

function ParagraphBlock({
  block,
  isOpening,
  isNepali,
  onLinkPress,
}: {
  block: Extract<ArticleBlock, { type: "paragraph" }>;
  isOpening: boolean;
  isNepali: boolean;
  onLinkPress: (href: string) => void;
}) {
  const { palette } = useTheme();
  const baseStyle: TextStyle = isNepali
    ? {
        fontFamily: fontFamilies.devaRegular,
        fontSize: 18.5,
        lineHeight: 33,
        color: palette.ink2,
      }
    : {
        fontFamily: fontFamilies.serifRegular,
        fontSize: 19,
        lineHeight: 31,
        color: palette.ink2,
      };

  // Raised initial on the opening paragraph (matching `.copy > p:first-of-type::first-letter`)
  if (isOpening && block.spans.length > 0) {
    const firstText = block.spans[0].text;
    const match = /^([A-Za-z])(.*)$/s.exec(firstText);
    if (match) {
      const initialChar = match[1];
      const restFirst = match[2];
      const adjustedSpans: InlineSpan[] = [
        ...(restFirst ? [{ ...block.spans[0], text: restFirst }] : []),
        ...block.spans.slice(1),
      ];

      return (
        <Text style={[baseStyle, styles.paragraph]}>
          <Text
            style={[
              styles.raisedInitial,
              { color: palette.ink },
            ]}
          >
            {initialChar}
          </Text>
          {renderInlineSpans(adjustedSpans, baseStyle, palette, isNepali, onLinkPress)}
        </Text>
      );
    }
  }

  return (
    <Text style={[baseStyle, styles.paragraph]}>
      {renderInlineSpans(block.spans, baseStyle, palette, isNepali, onLinkPress)}
    </Text>
  );
}

function HeadingBlock({
  block,
  isNepali,
  onLinkPress,
}: {
  block: Extract<ArticleBlock, { type: "heading" }>;
  isNepali: boolean;
  onLinkPress: (href: string) => void;
}) {
  const { palette } = useTheme();
  const fontSize = block.level === 2 ? 24 : block.level === 3 ? 20 : 18;
  const lineHeight = block.level === 2 ? 30 : block.level === 3 ? 26 : 24;

  const baseStyle: TextStyle = {
    fontFamily: isNepali ? fontFamilies.devaMedium : fontFamilies.serifMedium,
    fontSize,
    lineHeight,
    fontWeight: "500",
    letterSpacing: -0.3,
    color: palette.ink,
  };

  return (
    <Text
      style={[baseStyle, styles.heading]}
      accessibilityRole="header"
    >
      {renderInlineSpans(block.spans, baseStyle, palette, isNepali, onLinkPress)}
    </Text>
  );
}

function BlockquoteBlock({
  block,
  isNepali,
  onLinkPress,
}: {
  block: Extract<ArticleBlock, { type: "blockquote" }>;
  isNepali: boolean;
  onLinkPress: (href: string) => void;
}) {
  const { palette } = useTheme();
  const baseStyle: TextStyle = {
    fontFamily: isNepali ? fontFamilies.devaRegular : fontFamilies.serifLight,
    fontSize: 21.5,
    lineHeight: 30,
    letterSpacing: -0.25,
    color: palette.ink,
  };

  return (
    <View
      style={[
        styles.blockquote,
        {
          borderTopColor: palette.ink,
          borderBottomColor: palette.rule,
        },
      ]}
    >
      <Text style={baseStyle}>
        {renderInlineSpans(block.spans, baseStyle, palette, isNepali, onLinkPress)}
      </Text>
      {block.cite ? (
        <Text style={[styles.blockquoteCite, { color: palette.quiet }]}>
          {block.cite}
        </Text>
      ) : null}
    </View>
  );
}

function ListBlock({
  block,
  isNepali,
  onLinkPress,
}: {
  block: Extract<ArticleBlock, { type: "list" }>;
  isNepali: boolean;
  onLinkPress: (href: string) => void;
}) {
  const { palette } = useTheme();
  const baseStyle: TextStyle = isNepali
    ? {
        fontFamily: fontFamilies.devaRegular,
        fontSize: 18,
        lineHeight: 30,
        color: palette.ink2,
      }
    : {
        fontFamily: fontFamilies.serifRegular,
        fontSize: 18.5,
        lineHeight: 29,
        color: palette.ink2,
      };

  return (
    <View style={styles.listContainer}>
      {block.items.map((itemSpans, idx) => (
        <View key={idx} style={styles.listItemRow}>
          {block.ordered ? (
            <Text style={[styles.orderedMarker, { color: palette.quiet }]}>
              {idx + 1}.
            </Text>
          ) : (
            <View style={styles.unorderedMarkerWrap}>
              <View
                style={[
                  styles.unorderedDash,
                  { backgroundColor: palette.ink },
                ]}
              />
            </View>
          )}
          <Text style={[baseStyle, styles.listItemText]}>
            {renderInlineSpans(itemSpans, baseStyle, palette, isNepali, onLinkPress)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function InlineFigureBlock({
  block,
}: {
  block: Extract<ArticleBlock, { type: "image" }>;
}) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  /**
   * Inline art is not all landscape — a document scan, a chart or a portrait
   * arrives as often as a 16:10 photograph, and cropping those to a fixed box
   * cuts off the part the writer placed them for. The real ratio comes back
   * with the image, so the figure is laid out at 16:10 only until it loads.
   */
  const [ratio, setRatio] = useState<number | null>(null);

  if (failed) return null;

  return (
    <View style={styles.figure}>
      <View
        style={[
          styles.figureImageBox,
          { backgroundColor: palette.paper2, aspectRatio: ratio ?? 16 / 10 },
        ]}
      >
        <Image
          source={{ uri: sizedImageUrl(block.src, IMAGE_WIDTHS.hero) }}
          accessibilityLabel={block.alt || block.caption || "Article illustration"}
          style={styles.figureImage}
          contentFit={ratio ? "contain" : "cover"}
          transition={200}
          cachePolicy="memory-disk"
          onLoad={(e) => {
            const { width, height } = e.source ?? {};
            if (width && height) setRatio(width / height);
          }}
          onError={() => setFailed(true)}
        />
      </View>
      {block.caption ? (
        <Text style={[styles.figcaption, { color: palette.quiet }]}>
          {block.caption}
        </Text>
      ) : null}
    </View>
  );
}

function TableBlock({
  block,
}: {
  block: Extract<ArticleBlock, { type: "table" }>;
}) {
  const { palette } = useTheme();

  return (
    <View style={[styles.table, { borderTopColor: palette.ink }]}>
      {block.headers.length > 0 ? (
        <View style={[styles.tableRow, { borderBottomColor: palette.rule2 }]}>
          {block.headers.map((header, i) => (
            <Text
              key={i}
              style={[styles.tableHeaderCell, { color: palette.ink }]}
            >
              {header}
            </Text>
          ))}
        </View>
      ) : null}
      {block.rows.map((row, rIdx) => (
        <View
          key={rIdx}
          style={[styles.tableRow, { borderBottomColor: palette.rule }]}
        >
          {row.map((cell, cIdx) => (
            <Text
              key={cIdx}
              style={[styles.tableCell, { color: palette.ink2 }]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  paragraph: {
    marginBottom: 22,
  },
  raisedInitial: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 38,
    lineHeight: 38,
    fontWeight: "400",
  },
  heading: {
    marginTop: 26,
    marginBottom: 12,
  },
  blockquote: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 18,
    marginVertical: 24,
  },
  blockquoteCite: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 12,
  },
  listContainer: {
    marginBottom: 22,
    gap: 10,
  },
  listItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  orderedMarker: {
    width: 24,
    paddingTop: 5,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  unorderedMarkerWrap: {
    width: 22,
    paddingTop: 15,
    alignItems: "flex-start",
  },
  unorderedDash: {
    width: 8,
    height: 1,
  },
  listItemText: {
    flex: 1,
  },
  figure: {
    marginVertical: 24,
  },
  figureImageBox: {
    width: "100%",
    overflow: "hidden",
  },
  figureImage: {
    width: "100%",
    height: "100%",
  },
  figcaption: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  hr: {
    height: 1,
    width: "100%",
    marginVertical: 28,
  },
  codeBlock: {
    borderWidth: 1,
    padding: 14,
    marginVertical: 18,
  },
  codeBlockText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13.5,
    lineHeight: 20,
  },
  table: {
    borderTopWidth: 1,
    marginVertical: 20,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: 9,
    gap: 10,
  },
  tableHeaderCell: {
    flex: 1,
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tableCell: {
    flex: 1,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 21,
  },
});
