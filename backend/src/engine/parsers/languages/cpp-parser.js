export default class CppParser {
  constructor(parser, langId) { this.parser = parser; this.langId = langId; }
  parse(source, filePath) { return { symbols: [], relationships: [] }; }
}
