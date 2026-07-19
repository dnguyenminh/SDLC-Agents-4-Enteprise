"use client";

import React, { useEffect, useState } from "react";
import { marked } from "marked";

interface MarkdownInlineTextProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders inline markdown (e.g. **bold**) without block wrappers like <p>.
 * Used for export/preview where Tiptap edit mode is off.
 */
const MarkdownInlineText: React.FC<MarkdownInlineTextProps> = ({
  content,
  className = "",
  style,
}) => {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;
    const parse = async () => {
      try {
        const parsed = await marked.parseInline(content || "");
        if (!cancelled) setHtml(parsed);
      } catch {
        if (!cancelled) setHtml(content || "");
      }
    };
    void parse();
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (!html) {
    return (
      <span className={className} style={style}>
        {content}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default MarkdownInlineText;
