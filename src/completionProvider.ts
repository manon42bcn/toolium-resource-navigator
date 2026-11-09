import * as vscode from 'vscode';
import { completionAt, resourceSuggestions, type KeySuggestion } from './completion';
import { findResourceFiles } from './resources';

/**
 * Builds LANG/CONF suggestions on demand from current resource documents.
 * Duplicate labels share one item listing all public source paths. Only the
 * current segment is replaced; no closing bracket, separator, or value is added.
 * Cancellation, invalid documents, and unreadable files produce no stale results.
 */
export const completionProvider: vscode.CompletionItemProvider = {
  async provideCompletionItems(document, position, token) {
    const context = completionAt(document.lineAt(position.line).text, position.character);
    if (!context) return [];
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return [];
    const files = await findResourceFiles(document.uri, context.kind, token);
    const combined = new Map<string, { suggestion: KeySuggestion; sources: Set<string> }>();
    for (const uri of files) {
      if (token.isCancellationRequested) return [];
      try {
        const resource = await vscode.workspace.openTextDocument(uri);
        for (const suggestion of resourceSuggestions(resource.getText(), context)) {
          let item = combined.get(suggestion.label);
          if (!item) {
            item = { suggestion, sources: new Set() };
            combined.set(suggestion.label, item);
          }
          const base = folder.uri.path.replace(/\/$/, '') + '/';
          item.sources.add(uri.path.startsWith(base) ? uri.path.slice(base.length) : uri.path);
        }
      } catch {
        // One broken resource must not hide suggestions from the remaining files.
      }
    }
    if (token.isCancellationRequested) return [];
    return [...combined.values()].sort((a, b) => a.suggestion.label.localeCompare(b.suggestion.label,
      'en', { numeric: true })).map(({ suggestion, sources }) => {
      const item = new vscode.CompletionItem(suggestion.label,
        suggestion.kind === 'key' ? vscode.CompletionItemKind.Property : vscode.CompletionItemKind.Value);
      item.insertText = suggestion.label;
      item.range = new vscode.Range(position.line, context.start, position.line, context.end);
      item.detail = `${suggestion.kind} — ${[...sources].sort().join(', ')}`;
      return item;
    });
  }
};
