import * as vscode from 'vscode';
import { isMap, isScalar, parseDocument } from 'yaml';
import { referenceAt } from './resolver';
import { configuredBases } from './paths';
import { resourceUsageMatcher, type UsageMatcher } from './usageTargets';

/** Returns a literal mapping path only when the cursor is on its key. */
export function yamlKeyAt(text: string, offset: number): string[] | undefined {
  const doc = parseDocument(text);
  if (doc.errors.length) return;
  function walk(node: unknown, path: string[]): string[] | undefined {
    if (!isMap(node)) return;
    for (const pair of node.items) {
      if (!isScalar(pair.key) || !pair.key.range) continue;
      const key = String(pair.key.value);
      if (!key || /[.<>\[\]:\r\n]/.test(key)) continue;
      const next = [...path, key];
      if (offset >= pair.key.range[0] && offset < pair.key.range[1]) return next;
      const child = walk(pair.value, next);
      if (child) return child;
    }
  }
  return walk(doc.contents, []);
}

/** Closed LANG uses of a key or its descendants, compared by literal path segments. */
export function usageOffsets(text: string, path: string[]): { start: number; end: number }[] {
  if (!path.length) return [];
  return matchingUsageOffsets(text, ref => ref.kind === 'LANG' && ref.path.length >= path.length
    && path.every((key, i) => key === ref.path[i]));
}

export function matchingUsageOffsets(text: string, matcher: UsageMatcher): { start: number; end: number }[] {
  const results: { start: number; end: number }[] = [];
  for (const match of text.matchAll(/\[(?:LANG|CONF|POE|TOOLIUM):[^\[\]\r\n]+\]/g)) {
    const ref = referenceAt(match[0], 0);
    if (ref && matcher(ref)) results.push({ start: match.index!, end: match.index! + match[0].length });
  }
  return results;
}

function within(uri: vscode.Uri, base: vscode.Uri): boolean {
  return uri.scheme === base.scheme && uri.authority === base.authority
    && uri.path.startsWith(base.path.replace(/\/$/, '') + '/');
}

export async function findUsages(document: vscode.TextDocument, position: vscode.Position,
  token: vscode.CancellationToken): Promise<vscode.Location[]> {
  if (token.isCancellationRequested) return [];
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) return [];
  const config = vscode.workspace.getConfiguration('tooliumResources', document.uri);
  let matcher: UsageMatcher | undefined;
  if (/\.ya?ml$/i.test(document.uri.path)) {
    const resourceBases = configuredBases(folder.uri,
      config.get<string[]>('resourcePaths', ['acceptance/resources/language']));
    if (!resourceBases.some(base => within(document.uri, base))) return [];
    const path = yamlKeyAt(document.getText(), document.offsetAt(position));
    if (!path) return [];
    matcher = ref => ref.kind === 'LANG' && ref.path.length >= path.length
      && path.every((key, i) => key === ref.path[i]);
  } else {
    matcher = resourceUsageMatcher(document, document.offsetAt(position), folder.uri, config);
  }
  if (!matcher) return [];
  const bases = configuredBases(folder.uri,
    config.get<string[]>('referencePaths', ['acceptance/common', 'acceptance/features']));
  const candidates = new Map<string, vscode.Uri>();
  for (const base of bases) {
    if (token.isCancellationRequested) return [];
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(base, '**/*.{py,feature}'),
      '**/{.git,node_modules,.venv,venv,__pycache__}/**', undefined, token);
    for (const uri of files) {
      if (within(uri, base)) candidates.set(uri.toString(), uri);
    }
  }
  const results: vscode.Location[] = [];
  for (const uri of [...candidates.values()].sort((a, b) => a.toString().localeCompare(b.toString()))) {
    if (token.isCancellationRequested) return [];
    try {
      const source = await vscode.workspace.openTextDocument(uri);
      for (const match of matchingUsageOffsets(source.getText(), matcher)) {
        results.push(new vscode.Location(uri,
          new vscode.Range(source.positionAt(match.start), source.positionAt(match.end))));
      }
    } catch {
      // A removed or unreadable file must not hide other usages.
    }
  }
  return token.isCancellationRequested ? [] : results;
}

export function registerUsageProviders(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [{ language: 'yaml' }, { pattern: '**/*.{yaml,yml,json}' },
    { pattern: '**/toolium.cfg' }, { pattern: '**/local-toolium.cfg' }];
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition(document, position, token) {
        if (!vscode.workspace.getConfiguration('tooliumResources', document.uri)
          .get<boolean>('enableUsageNavigation', true)) return [];
        return findUsages(document, position, token);
      }
    }),
    vscode.languages.registerReferenceProvider(selector, {
      provideReferences(document, position, _context, token) {
        return findUsages(document, position, token);
      }
    })
  );
}
