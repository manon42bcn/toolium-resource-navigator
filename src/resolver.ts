import { parseTree, type ParseError } from 'jsonc-parser';
import { isMap, isScalar, parseDocument } from 'yaml';

/** Location of the deepest matched key and number of resolved path segments. */
export interface Match { offset: number; depth: number }

/**
 * Finds the deepest YAML mapping key reachable through a LANG resource path.
 * Stops before dynamic segments, missing keys, or values that are not mappings;
 * language entries are not selected automatically.
 *
 * @param source - YAML document text, including any unsaved edits.
 * @param path - Resource key segments, starting at the document root.
 * @returns The last matched key's character offset and depth, or undefined if
 * the YAML is invalid or the root segment cannot be resolved. Parser offsets
 * distinguish repeated keys and preserve locations around multiline values.
 */
export function resolveYaml(source: string, path: string[]): Match | undefined {
  const doc = parseDocument(source);
  if (doc.errors.length) return undefined;
  let node: unknown = doc.contents;
  let match: Match | undefined;
  for (const segment of path) {
    if (!segment || segment.includes('<') || !isMap(node)) break;
    const pair = node.items.find(p => isScalar(p.key) && String(p.key.value) === segment);
    if (!pair || !isScalar(pair.key) || !pair.key.range) break;
    match = { offset: pair.key.range[0], depth: (match?.depth ?? 0) + 1 };
    node = pair.value;
  }
  return match;
}

/**
 * Finds the LANG, CONF, POE, FILE, FILE_UTF8, or BASE64 reference containing the cursor on a single source line.
 * Each reference is checked independently, including concatenated references.
 *
 * @param line - Source line from a Python or feature document.
 * @param character - Zero-based cursor offset within the line.
 * @returns The literal reference value, dot-separated path segments and the reference's start (inclusive)
 * and end (exclusive) offsets, or undefined when the cursor is outside a reference.
 */
export function referenceAt(line: string, character: number):
  { kind: 'LANG' | 'CONF' | 'POE' | 'FILE' | 'FILE_UTF8' | 'BASE64'; value: string; path: string[]; start: number; end: number } | undefined {
  for (const match of line.matchAll(/\[(LANG|CONF|POE|FILE|FILE_UTF8|BASE64):([^\]\r\n]+)\]/g)) {
    const start = match.index!;
    const end = start + match[0].length;
    if (character >= start && character < end) {
      return { kind: match[1] as 'LANG' | 'CONF' | 'POE' | 'FILE' | 'FILE_UTF8' | 'BASE64', value: match[2], path: match[2].split('.'), start, end };
    }
  }
  return undefined;
}

/**
 * Resolves a CONF path against a strict JSON object using parser source offsets.
 * Stops at missing or dynamic segments and never descends into arrays or scalars.
 * @returns The deepest matched key, or undefined for invalid JSON or unknown roots.
 */
export function resolveJson(source: string, path: string[]): Match | undefined {
  const errors: ParseError[] = [];
  let node = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length) return undefined;
  let match: Match | undefined;
  for (const segment of path) {
    if (!segment || segment.includes('<') || node?.type !== 'object') break;
    const property = node.children?.find(p => p.children?.[0].value === segment);
    const key = property?.children?.[0];
    if (!key) break;
    match = { offset: key.offset, depth: (match?.depth ?? 0) + 1 };
    node = property?.children?.[1];
  }
  return match;
}

/**
 * Classifies a configuration file by name before any content is opened.
 * Private filenames are always rejected, including explicitly configured bases.
 * Base names are configurable; other public *-properties.json files are environments.
 */
export function configurationFileKind(name: string, baseFiles: string[]):
  'base' | 'environment' | undefined {
  const lower = name.toLowerCase();
  if (/(?:^|-)private(?:-properties)?\.json$/.test(lower)) return undefined;
  if (baseFiles.includes(name)) return 'base';
  return lower.endsWith('-properties.json') ? 'environment' : undefined;
}

/**
 * Finds exact POEditor reference values in a strict JSON array of objects.
 * References are literal identifiers: colons and dots are not path separators.
 * @param source - Current JSON document contents.
 * @param reference - Full text following the POE prefix.
 * @returns Locations of matching reference values, including duplicates, or an
 * empty list for invalid JSON, a non-array root, or an unknown reference.
 */
export function resolvePoe(source: string, reference: string): Match[] {
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length || root?.type !== 'array') return [];
  const matches: Match[] = [];
  for (const entry of root.children ?? []) {
    if (entry.type !== 'object') continue;
    const property = entry.children?.find(p => p.children?.[0].value === 'reference');
    const value = property?.children?.[1];
    if (value?.type === 'string' && value.value === reference) {
      matches.push({ offset: value.offset, depth: 1 });
    }
  }
  return matches;
}

/**
 * Validates a FILE, FILE_UTF8, or BASE64 reference as a slash-separated path relative to resources.
 * Absolute paths, parent traversal, URI schemes, and directory-only paths are
 * rejected. File extensions are optional; existence and file type are checked
 * by the definition provider through the workspace filesystem API.
 * @returns Path segments to join beneath acceptance/resources, or undefined.
 */
export function filePathSegments(value: string): string[] | undefined {
  if (!value || value.startsWith('/') || value.endsWith('/') || /[\\:\x00]/.test(value)) return;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '..' || segment === '.')) return;
  return segments;
}
