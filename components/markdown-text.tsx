/**
 * Lightweight markdown renderer for chat messages.
 * Supports: **bold**, *italic*, `code`, [links](url), - bullet lists
 */
import React from 'react';
import { Text, Linking, StyleSheet, type TextStyle, type StyleProp } from 'react-native';

type Segment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; text: string; url: string };

// Combined regex for links, code, bold, italic (matches earliest occurrence)
const COMBINED_RE =
  /(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)|(\*\*(.+?)\*\*|__(.+?)__)|(\*(.+?)\*|_(.+?)_)/g;

// Preprocess: convert bullet list markers (- , * , + ) at line start to • so they don't get parsed as italic
function preprocessBullets(input: string): string {
  return input.replace(/^(\s*)([-*+])\s+/gm, '$1• ');
}

function parseInlineMarkdown(input: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  COMBINED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMBINED_RE.exec(input)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', content: input.slice(lastIndex, m.index) });
    }
    if (m[1] !== undefined) {
      segments.push({ type: 'link', text: m[2], url: m[3] });
    } else if (m[4] !== undefined) {
      segments.push({ type: 'code', content: m[5] });
    } else if (m[6] !== undefined) {
      segments.push({ type: 'bold', content: m[7] || m[8] });
    } else if (m[9] !== undefined) {
      segments.push({ type: 'italic', content: m[10] || m[11] });
    }
    lastIndex = COMBINED_RE.lastIndex;
  }
  if (lastIndex < input.length) {
    segments.push({ type: 'text', content: input.slice(lastIndex) });
  }
  if (segments.length === 0 && input) {
    segments.push({ type: 'text', content: input });
  }
  return segments;
}

function parseMarkdown(input: string): Segment[] {
  return parseInlineMarkdown(preprocessBullets(input));
}

interface MarkdownTextProps {
  children: string;
  baseStyle?: StyleProp<TextStyle>;
  boldStyle?: TextStyle;
  italicStyle?: TextStyle;
  codeStyle?: TextStyle;
  linkStyle?: TextStyle;
  onLinkPress?: (url: string) => void;
}

export function MarkdownText({
  children,
  baseStyle,
  boldStyle,
  italicStyle,
  codeStyle,
  linkStyle,
  onLinkPress,
}: MarkdownTextProps) {
  const segments = React.useMemo(() => parseMarkdown(children), [children]);

  const handleLinkPress = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <Text style={baseStyle}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <Text key={i} style={baseStyle}>{seg.content}</Text>;
        }
        if (seg.type === 'bold') {
          return (
            <Text key={i} style={[baseStyle, defaultStyles.bold, boldStyle]}>
              {seg.content}
            </Text>
          );
        }
        if (seg.type === 'italic') {
          return (
            <Text key={i} style={[baseStyle, defaultStyles.italic, italicStyle]}>
              {seg.content}
            </Text>
          );
        }
        if (seg.type === 'code') {
          return (
            <Text key={i} style={[baseStyle, defaultStyles.code, codeStyle]}>
              {seg.content}
            </Text>
          );
        }
        if (seg.type === 'link') {
          return (
            <Text
              key={i}
              style={[baseStyle, defaultStyles.link, linkStyle]}
              onPress={() => handleLinkPress(seg.url)}
            >
              {seg.text}
            </Text>
          );
        }
        return null;
      })}
    </Text>
  );
}

const defaultStyles = StyleSheet.create({
  bold: { fontFamily: 'DMSans_600SemiBold', fontWeight: '600' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: 'Menlo',
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  link: { textDecorationLine: 'underline' },
});
