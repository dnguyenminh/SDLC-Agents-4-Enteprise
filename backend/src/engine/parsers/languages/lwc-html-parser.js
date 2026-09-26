export default {
  parse: (source, filePath) => {
    const symbols = [];
    if (!source) return { symbols, relationships: [] };
    const tagRegex = /<\s*([a-zA-Z][a-zA-Z0-9_-]*)\b[^>]*>/g;
    let match;
    const seen = new Set();
    while ((match = tagRegex.exec(source)) !== null) {
      const name = match[1];
      // Focus on LWC custom components: contains hyphen or lightning- or c-
      if (name.includes('-') || name.startsWith('c-') || name.startsWith('lightning-')) {
        if (!seen.has(name)) {
          seen.add(name);
          const index = match.index;
          const line = source.substring(0, index).split('\n').length;
          symbols.push({
            name,
            kind: 'component',
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0
          });
        }
      }
    }
    return { symbols, relationships: [] };
  }
};
