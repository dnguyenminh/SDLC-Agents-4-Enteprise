export default class CParser {
  constructor(parser, langId) { this.parser = parser; this.langId = langId; }
  parse(source, filePath) { return { symbols: [], relationships: [] }; }
}
