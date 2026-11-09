import * as vscode from 'vscode';
import { isMap, isScalar, parseDocument } from 'yaml';
import { referenceAt } from './resolver';
import { configuredBases } from './paths';

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

/** Exact LANG uses, including the explicit-language syntax supported by navigation. */
export function usageOffsets(text: string, path: string[]): { start: number; end: number }[] {
  const results: { start: number; end: number }[] = [];
  for (const match of text.matchAll(/\[LANG:[^\]\r\n]+\]/g)) {
    const ref = referenceAt(match[0], 0);
    if (ref && ref.path.length === path.length && ref.path.every((key, i) => key === path[i])) {
      results.push({ start: match.index!, end: match.index! + match[0].length });
    }
  }
  return results;
}

function within(uri: vscode.Uri, base: vscode.Uri): boolean {
  return uri.scheme === base.scheme && uri.authority === base.authority
    && uri.path.startsWith(base.path.replace(/\/$/, '') + '/');
}

export async function findUsages(document: vscode.TextDocument, position: vscode.Position,
  token: vscode.CancellationToken): Promise<vscode.Location[]> {
  if (token.isCancellationRequested || !/\.ya?ml$/i.test(document.uri.path)) return [];
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) return [];
  const config = vscode.workspace.getConfiguration('tooliumResources', document.uri);
  const resourceBases = configuredBases(folder.uri,
    config.get<string[]>('resourcePaths', ['acceptance/resources/language']));
  if (!resourceBases.some(base => within(document.uri, base))) return [];
  const path = yamlKeyAt(document.getText(), document.offsetAt(position));
  if (!path) return [];
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
      for (const match of usageOffsets(source.getText(), path)) {
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
  const selector: vscode.DocumentSelector = [{ language: 'yaml' }, { pattern: '**/*.{yaml,yml}' }];
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
