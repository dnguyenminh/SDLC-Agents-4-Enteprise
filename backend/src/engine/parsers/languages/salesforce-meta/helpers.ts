export function extractXmlValues(source: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'g');
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push(match[1]);
  }
  return results;
}

export function extractXmlBlocks(source: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}>[\\s\\S]*?</${tagName}>`, 'g');
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push(match[0]);
  }
  return results;
}

export function nameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? normalized;
  return basename
    .replace(/\.(flow|object|field|js|component)-meta\.xml$/, '')
    .replace(/\.\w+$/, '');
}

export function inferObjectFromFieldPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/objects\/([^/]+)\/fields\//);
  return match ? match[1] : null;
}
