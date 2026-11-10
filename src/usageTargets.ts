import * as vscode from 'vscode';
import { type Node } from 'jsonc-parser';
import { configurationFileKind, referenceAt, resolvePoe, resolveToolium } from './resolver';
import { jsonChild, jsonTree } from './tree';
import { configuredBases } from './paths';

export type UsageMatcher = (ref: NonNullable<ReturnType<typeof referenceAt>>) => boolean;

/** Literal JSON property path under the cursor, including indices of enclosing arrays. */
export function jsonKeyAt(root: Node | undefined, offset: number, path: string[] = []): string[] | undefined {
  if (root?.type === 'object') {
    for (const property of root.children ?? []) {
      const [key, value] = property.children ?? [];
      if (!key || !value || !key.value || /[.<>\[\]\r\n]/.test(key.value)) continue;
      const next = [...path, String(key.value)];
      if (offset >= key.offset && offset < key.offset + key.length) return next;
      const child = jsonKeyAt(value, offset, next);
      if (child) return child;
    }
  } else if (root?.type === 'array') {
    for (const [index, value] of (root.children ?? []).entries()) {
      const child = jsonKeyAt(value, offset, [...path, String(index)]);
      if (child) return child;
    }
  }
}

function within(uri: vscode.Uri, base: vscode.Uri): boolean {
  return uri.scheme === base.scheme && uri.authority === base.authority
    && uri.path.startsWith(base.path.replace(/\/$/, '') + '/');
}

/** Restrict reverse searches to the same resource files accepted by forward navigation. */
export function resourceUsageMatcher(document: vscode.TextDocument, offset: number,
  folder: vscode.Uri, config: vscode.WorkspaceConfiguration): UsageMatcher | undefined {
  const inBases = (setting: string, fallback: string) => configuredBases(folder,
    config.get<string[]>(setting, [fallback])).some(base => within(document.uri, base));
  const name = document.uri.path.slice(document.uri.path.lastIndexOf('/') + 1);
  if (/\.json$/i.test(name)) {
    const isConf = inBases('configurationPaths', 'acceptance/settings') && configurationFileKind(name,
      config.get<string[]>('baseConfigurationFiles', ['global-properties.json', 'common-properties.json']));
    const isPoe = inBases('poeditorPaths', 'acceptance/resources/poeditor');
    if (!isConf && !isPoe) return;
    const text = document.getText();
    const root = jsonTree(text);
    const path = isConf ? jsonKeyAt(root, offset) : undefined;
    const keyField = config.get<string>('poeditorKeyField', 'reference');
    const poeValues = root?.type === 'array' && isPoe ? (root.children ?? []).flatMap(entry => {
      if (entry.type !== 'object') return [];
      return (entry.children ?? []).flatMap(property => {
        const [key, value] = property.children ?? [];
        return key?.value === keyField && value?.type === 'string'
          && offset >= value.offset && offset < value.offset + value.length ? [value.offset] : [];
      });
    }) : [];
    if (!path && !poeValues.length) return;
    return ref => {
      if (ref.kind === 'CONF' && path) {
        let node = root;
        for (let i = 0; i < path.length; i++) {
          let segment = ref.path[i];
          if (segment === undefined) return false;
          if (node?.type === 'array' && /^[+-]?\d+$/.test(segment)) {
            const index = Number(segment);
            segment = String(index < 0 ? (node.children?.length ?? 0) + index : index);
          }
          if (segment !== path[i]) return false;
          node = jsonChild(node, segment)?.value;
        }
        return true;
      }
      return ref.kind === 'POE' && poeValues.length > 0 && resolvePoe(text, ref.value, {
        keyField, searchType: config.get<'exact' | 'contains'>('poeditorSearchType', 'exact'),
        prefixes: config.get<string[]>('poeditorPrefixes', [])
      }).some(match => poeValues.includes(match.offset));
    };
  }
  if (!inBases('tooliumPaths', 'acceptance/settings')) return;
  const bases = configuredBases(folder, config.get<string[]>('tooliumPaths', ['acceptance/settings']));
  if (!bases.some(base => ['toolium.cfg', 'local-toolium.cfg'].some(file =>
    vscode.Uri.joinPath(base, file).toString() === document.uri.toString()))) return;
  const text = document.getText();
  let start = 0;
  let section: string | undefined;
  for (const raw of text.split(/(?<=\n)/)) {
    const line = raw.replace(/\r?\n$/, '');
    const header = /^\s*\[([^\]]+)\]/.exec(line);
    if (header) section = header[1];
    if (offset >= start && offset < start + line.length) {
      if (header) {
        const keyStart = start + line.indexOf('[') + 1;
        if (offset < keyStart || offset >= keyStart + header[1].length) return;
        const selectedSection = section;
        return ref => ref.kind === 'TOOLIUM'
          && ref.value.slice(0, ref.value.indexOf('_')) === selectedSection
          && resolveToolium(text, ref.value).length > 0;
      }
      const entry = /^(\s*)([^#;:=][^:=]*?)\s*[:=]/.exec(line);
      const keyStart = start + (entry?.[1].length ?? 0);
      if (!entry || offset < keyStart || offset >= keyStart + entry[2].trimEnd().length) return;
      return ref => ref.kind === 'TOOLIUM'
        && resolveToolium(text, ref.value).some(match => match.offset === keyStart);
    }
    start += raw.length;
  }
}
