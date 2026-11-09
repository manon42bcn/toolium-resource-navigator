import { isMap, isScalar, parseDocument } from 'yaml';
import { jsonChild, jsonTree, yamlChild } from './tree';

export interface CompletionContext {
  kind: 'LANG' | 'CONF';
  parent: string[];
  prefix: string;
  languages: boolean;
  start: number;
  end: number;
}

export interface KeySuggestion { label: string; kind: 'key' | 'index' | 'language' }

/**
 * Detects an open LANG/CONF placeholder before the cursor, without requiring ].
 * Returns the parent path and only the current segment's replacement bounds,
 * including an existing suffix to the right of the cursor. A LANG :: suffix
 * switches to language suggestions without treating the language as a path key.
 */
export function completionAt(line: string, character: number): CompletionContext | undefined {
  const match = /\[(LANG|CONF):([^\[\]\s"'`]*?)$/.exec(line.slice(0, character));
  if (!match) return;
  const kind = match[1] as 'LANG' | 'CONF';
  const value = match[2];
  const separator = kind === 'LANG' ? value.indexOf('::') : -1;
  const languages = separator >= 0;
  const parent = languages ? value.slice(0, separator).split('.') : value.split('.').slice(0, -1);
  const prefix = languages ? value.slice(separator + 2) : value.slice(value.lastIndexOf('.') + 1);
  // Colons are reserved for the explicit-language separator in this context.
  if (prefix.includes(':') || parent.some(part => !part || part.includes(':') || part.includes('<'))) return;
  let end = character;
  while (end < line.length && !/[.:[\]\s"'`]/.test(line[end])) end++;
  return { kind, parent, prefix, languages, start: character - prefix.length, end };
}

/** Keys containing path syntax cannot be inserted as a single literal segment. */
function addressable(label: string): boolean {
  return !!label && !/[.:[\]<>\s"'`]/.test(label);
}

/**
 * Lists immediate children of an exactly resolved resource node. Missing and
 * dynamic parent segments never fall back to a different level. YAML terminal
 * mappings with language-tag-shaped scalar/sequence keys are treated as language
 * groups: their children are offered only after ::. No active language is inferred.
 * JSON arrays offer nonnegative indices; typed negative indices remain navigable.
 */
export function resourceSuggestions(source: string, context: CompletionContext): KeySuggestion[] {
  let suggestions: KeySuggestion[] = [];
  if (context.kind === 'LANG') {
    const doc = parseDocument(source);
    if (doc.errors.length) return [];
    let node: unknown = doc.contents;
    for (const segment of context.parent) {
      const pair = yamlChild(node, segment);
      if (!pair) return [];
      node = pair.value;
    }
    if (!isMap(node)) return [];
    const entries = node.items.filter(pair => isScalar(pair.key));
    const isLanguageGroup = entries.length > 0 && entries.every(pair =>
      isScalar(pair.key) && /^[a-z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(String(pair.key.value))
      && !isMap(pair.value));
    if (!context.languages && isLanguageGroup) return [];
    if (context.languages && entries.some(pair => isMap(pair.value))) return [];
    suggestions = entries.map(pair => ({
      label: String(isScalar(pair.key) ? pair.key.value : ''),
      kind: context.languages ? 'language' : 'key'
    }));
  } else {
    let node = jsonTree(source);
    for (const segment of context.parent) {
      const child = jsonChild(node, segment);
      if (!child) return [];
      node = child.value;
    }
    if (node?.type === 'array') {
      suggestions = (node.children ?? []).map((_, index) => ({ label: String(index), kind: 'index' }));
    } else if (node?.type === 'object') {
      suggestions = (node.children ?? []).map(pair => ({ label: String(pair.children?.[0].value), kind: 'key' }));
    }
  }
  return suggestions.filter(item => addressable(item.label) && item.label.startsWith(context.prefix));
}
