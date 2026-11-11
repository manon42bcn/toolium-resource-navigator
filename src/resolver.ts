import { jsonChild, jsonTree, yamlChild } from './tree';
import { isScalar, parseDocument } from 'yaml';

/** Location of the deepest matched key and number of resolved path segments. */
export interface Match { offset: number; depth: number; priority?: number }

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
    const pair = yamlChild(node, segment);
    if (!pair || !isScalar(pair.key) || !pair.key.range) break;
    match = { offset: pair.key.range[0], depth: (match?.depth ?? 0) + 1 };
    node = pair.value;
  }
  return match;
}

export function placeholderMatches(line: string) {
  return line.matchAll(/\[(LANG|CONF|POE|FILE|FILE_UTF8|BASE64|TOOLIUM):([^\]\r\n]+)\]/g);
}

/**
 * Finds the LANG, CONF, POE, FILE, FILE_UTF8, BASE64, or TOOLIUM reference containing the cursor on a single source line.
 * Each reference is checked independently, including concatenated references.
 *
 * @param line - Source line from a Python or feature document.
 * @param character - Zero-based cursor offset within the line.
 * @returns The literal reference value, dot-separated path segments and the reference's start (inclusive)
 * and end (exclusive) offsets, or undefined when the cursor is outside a reference.
 */
export function referenceAt(line: string, character: number):
  { kind: 'LANG' | 'CONF' | 'POE' | 'FILE' | 'FILE_UTF8' | 'BASE64' | 'TOOLIUM'; value: string; path: string[]; start: number; end: number } | undefined {
  for (const match of placeholderMatches(line)) {
    const start = match.index!;
    const end = start + match[0].length;
    if (character >= start && character < end) {
      // Explicit LANG languages are YAML child keys, not part of the resource key.
      const separator = match[1] === 'LANG' ? match[2].indexOf('::') : -1;
      const path = separator < 0 ? match[2].split('.')
        : [...match[2].slice(0, separator).split('.'), match[2].slice(separator + 2)];
      return { kind: match[1] as 'LANG' | 'CONF' | 'POE' | 'FILE' | 'FILE_UTF8' | 'BASE64' | 'TOOLIUM', value: match[2], path, start, end };
    }
  }
  return undefined;
}

/**
 * Resolves a CONF path against a strict JSON object using parser source offsets.
 * Traverses objects and integer array indices (including negative Python indices).
 * Stops at missing or dynamic segments, invalid indices, and scalar values.
 * @returns The deepest matched key, or undefined for invalid JSON or unknown roots.
 */
export function resolveJson(source: string, path: string[]): Match | undefined {
  let node = jsonTree(source);
  let match: Match | undefined;
  for (const segment of path) {
    const child = jsonChild(node, segment);
    if (!child) break;
    match = { offset: child.offset, depth: (match?.depth ?? 0) + 1 };
    node = child.value;
  }
  return match;
}

/**
 * Classifies a configuration file by name before any content is opened.
 * Exclusions are applied separately before opening files.
 * Base names are configurable; other *-properties.json files are environments.
 */
export function configurationFileKind(name: string, baseFiles: string[]):
  'base' | 'environment' | undefined {
  const lower = name.toLowerCase();
  if (baseFiles.includes(name)) return 'base';
  return lower.endsWith('-properties.json') ? 'environment' : undefined;
}

/** Explicit POEditor lookup settings; defaults preserve the original navigation. */
export interface PoeOptions {
  searchType?: 'exact' | 'contains';
  keyField?: string;
  prefixes?: string[];
}

/**
 * Finds POEditor key-field values in a strict JSON array of objects.
 * Colons and dots are literal identifiers, not path separators. Configured prefixes
 * are tried in order, followed by the unprefixed reference. As in Toolium, a prefix
 * is inserted after the first colon when present. Prefix ranks allow the provider
 * to select the first successful prefix across all files, not separately per file.
 * This locates definitions without filtering their translation contents.
 * @returns Matching key-field locations, or an empty list for invalid input.
 */
export function resolvePoe(source: string, reference: string, options: PoeOptions = {}): Match[] {
  const root = jsonTree(source);
  if (root?.type !== 'array') return [];
  const prefixes = [...(options.prefixes ?? []), ''];
  const matches: Match[] = [];
  for (let priority = 0; priority < prefixes.length; priority++) {
    const prefix = prefixes[priority];
    const parts = reference.split(':');
    const candidate = prefix && parts.length > 1
      ? `${parts[0]}:${prefix}${parts[1]}` : `${prefix}${reference}`;
    for (const entry of root.children ?? []) {
      if (entry.type !== 'object') continue;
      const property = entry.children?.find(p => p.children?.[0].value === (options.keyField ?? 'reference'));
      const value = property?.children?.[1];
      if (value?.type !== 'string') continue;
      if (options.searchType === 'contains' ? value.value.includes(candidate) : value.value === candidate) {
        matches.push({ offset: value.offset, depth: 1,
          ...(options.prefixes?.length ? { priority } : {}) });
      }
    }
  }
  return matches;
}

/**
 * Validates a FILE, FILE_UTF8, or BASE64 reference as a slash-separated path relative to the configured base directory.
 * Absolute paths, parent traversal, URI schemes, and directory-only paths are
 * rejected. File extensions are optional; existence and file type are checked
 * by the definition provider through the workspace filesystem API.
 * @returns Path segments to join beneath the configured resource directory, or undefined.
 */
export function filePathSegments(value: string): string[] | undefined {
  if (!value || value.startsWith('/') || value.endsWith('/') || /[\\:\x00]/.test(value)) return;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '..' || segment === '.')) return;
  return segments;
}

/**
 * Locates explicit section/option definitions in a Toolium CFG document.
 * The first underscore separates the section from the complete option name;
 * both are case-sensitive. Toolium's colon-to-triple-underscore option encoding
 * is respected. Values, interpolation, DEFAULT inheritance, and runtime overrides
 * are not evaluated. Indented continuation lines and full-line comments are ignored.
 * @param source - Current CFG contents, including unsaved edits.
 * @param reference - Section_option text following the TOOLIUM prefix.
 * @returns Matching option-key offsets, or an empty list if no definition exists.
 */
export function resolveToolium(source: string, reference: string): Match[] {
  const separator = reference.indexOf('_');
  if (separator <= 0 || separator === reference.length - 1) return [];
  const section = reference.slice(0, separator);
  const option = reference.slice(separator + 1).replace(/:/g, '___');
  const matches: Match[] = [];
  let currentSection: string | undefined;
  let optionIndent: number | undefined;
  let offset = 0;
  for (const raw of source.split(/(?<=\n)/)) {
    const line = raw.replace(/\r?\n$/, '');
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith(';')) {
      if (optionIndent === undefined || indent <= optionIndent) {
        const header = /^\[([^\]]+)\]/.exec(trimmed);
        if (header) {
          currentSection = header[1];
          optionIndent = undefined;
        } else {
          const entry = /^([^:=]+?)\s*[:=]/.exec(trimmed);
          if (entry && currentSection !== undefined) {
            optionIndent = indent;
            if (currentSection === section && entry[1].trim() === option) {
              matches.push({ offset: offset + indent, depth: 2 });
            }
          }
        }
      }
    }
    offset += raw.length;
  }
  return matches;
}
