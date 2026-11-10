/**
 * Attribute-level readers for the draw.io XML parser: cell attributes, geometry,
 * waypoints, style anchors and terminal points.
 */

export function parseGeometry(body: string, _cellAttrs: Record<string, string>): { x: number; y: number; w: number; h: number } | null {
  // Look for mxGeometry in body or as sibling in raw XML
  const geomRegex = /<mxGeometry\s([^>]*?)(?:\/>|>)/;
  const geomMatch = body.match(geomRegex);
  if (!geomMatch) return null;
  const attrs = parseAttrs(geomMatch[1]);
  if (attrs['as'] !== 'geometry') return null;
  return {
    x: parseFloat(attrs['x'] ?? '0'),
    y: parseFloat(attrs['y'] ?? '0'),
    w: parseFloat(attrs['width'] ?? '80'),
    h: parseFloat(attrs['height'] ?? '40'),
  };
}

export function parseAttrs(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(attrStr)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

/** Extract stored waypoints from an edge's <Array as="points"> section. */
export function parseWaypoints(body: string): Array<{ x: number; y: number }> {
  const arr = /<Array\s+as="points">([\s\S]*?)<\/Array>/.exec(body);
  if (!arr) return [];
  const points: Array<{ x: number; y: number }> = [];
  const pointRegex = /<mxPoint\s([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = pointRegex.exec(arr[1])) !== null) {
    const attrs = parseAttrs(m[1]);
    points.push({ x: parseFloat(attrs['x'] ?? '0'), y: parseFloat(attrs['y'] ?? '0') });
  }
  return points;
}

/** Parse exit/entry anchor fractions (exitX/exitY, entryX/entryY) from edge style. */
export function parseStyleAnchor(style: string, kind: 'exit' | 'entry'): { x: number; y: number } | null {
  const x = new RegExp(`${kind}X=([^;]*)`).exec(style)?.[1];
  const y = new RegExp(`${kind}Y=([^;]*)`).exec(style)?.[1];
  if (x === undefined && y === undefined) return null;
  return { x: parseFloat(x ?? '0.5'), y: parseFloat(y ?? '0.5') };
}

/** Extract a stored terminal hint point (as="sourcePoint"|"targetPoint"). */
export function parseTerminalPoint(body: string, kind: 'sourcePoint' | 'targetPoint'): { x: number; y: number } | null {
  const tagRe = /<mxPoint\s([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    if (!m[1].includes(`as="${kind}"`)) continue;
    const attrs = parseAttrs(m[1]);
    return { x: parseFloat(attrs['x'] ?? '0'), y: parseFloat(attrs['y'] ?? '0') };
  }
  return null;
}
