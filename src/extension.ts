import * as vscode from 'vscode';
import { configurationFileKind, filePathSegments, referenceAt, resolveJson, resolvePoe, resolveYaml } from './resolver';

/**
 * Registers LANG, CONF, POE, FILE, FILE_UTF8, and BASE64 definition navigation for Python and Gherkin documents.
 * VS Code calls this entry point when the extension is activated; the context
 * owns the provider registration and disposes it when the extension unloads.
 *
 * @param context - Extension lifecycle context supplied by VS Code.
 */
export function activate(context: vscode.ExtensionContext): void {
  const provider: vscode.DefinitionProvider = {
    /**
     * Resolves the LANG, CONF, POE, FILE, FILE_UTF8, or BASE64 reference against configured resource folders
     * in the source document's workspace folder. Reads current document contents
     * and returns a FILE/FILE_UTF8/BASE64 target, exact POE matches, or the deepest LANG/CONF paths.
     *
     * @param document - Source document containing the reference.
     * @param position - Cursor position requested by Go to Definition.
     * @param token - Cancellation signal from VS Code.
     * @returns Definition links, an empty list if no resource matches, or undefined
     * when there is no reference or workspace folder, or cancellation is observed.
     */
    async provideDefinition(document, position, token) {
      const ref = referenceAt(document.lineAt(position.line).text, position.character);
      if (!ref) return;
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!folder) return;
      if (ref.kind === 'FILE' || ref.kind === 'FILE_UTF8' || ref.kind === 'BASE64') {
        const segments = filePathSegments(ref.value);
        if (!segments || token.isCancellationRequested) return [];
        const targetUri = vscode.Uri.joinPath(folder.uri, 'acceptance/resources', ...segments);
        try {
          // Stat the exact target: directories and nonexistent paths have no definition.
          const stat = await vscode.workspace.fs.stat(targetUri);
          if (token.isCancellationRequested || !(stat.type & vscode.FileType.File)) return [];
          const range = new vscode.Range(0, 0, 0, 0);
          return [{
            originSelectionRange: new vscode.Range(position.line, ref.start, position.line, ref.end),
            targetUri, targetRange: range, targetSelectionRange: range
          }];
        } catch {
          return [];
        }
      }
      const config = vscode.workspace.getConfiguration('tooliumResources', document.uri);
      const isConf = ref.kind === 'CONF';
      const isPoe = ref.kind === 'POE';
      const paths = isPoe
        ? config.get<string[]>('poeditorPaths', ['acceptance/resources/poeditor'])
        : isConf
        ? config.get<string[]>('configurationPaths', ['acceptance/settings'])
        : config.get<string[]>('resourcePaths', ['acceptance/resources/language']);
      const baseFiles = config.get<string[]>('baseConfigurationFiles',
        ['global-properties.json', 'common-properties.json']);
      const files = new Map<string, vscode.Uri>();
      for (const path of paths) {
        const base = vscode.Uri.joinPath(folder.uri, path);
        for (const uri of await vscode.workspace.findFiles(
          new vscode.RelativePattern(base, (isConf || isPoe) ? '**/*.json' : '**/*.{yaml,yml}'),
          '**/{node_modules,.git}/**', undefined, token)) {
          // Reject private files by basename before opening any document.
          const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);
          if (isConf && !configurationFileKind(name, baseFiles)) continue;
          files.set(uri.toString(), uri);
        }
      }
      const results: { depth: number; link: vscode.DefinitionLink }[] = [];
      // Show base definitions first without implying runtime override precedence.
      const candidates = [...files.values()].sort((a, b) => {
        const rank = (uri: vscode.Uri) => configurationFileKind(
          uri.path.slice(uri.path.lastIndexOf('/') + 1), baseFiles) === 'base' ? 0 : 1;
        return (isConf ? rank(a) - rank(b) : 0) || a.toString().localeCompare(b.toString());
      });
      for (const uri of candidates) {
        if (token.isCancellationRequested) return;
        try {
          const resource = await vscode.workspace.openTextDocument(uri);
          const text = resource.getText();
          const resolvedPath = isPoe ? undefined : (isConf ? resolveJson : resolveYaml)(text, ref.path);
          const matches = isPoe ? resolvePoe(text, ref.value) : resolvedPath ? [resolvedPath] : [];
          for (const resolved of matches) {
            const target = resource.positionAt(resolved.offset);
            const range = resource.getWordRangeAtPosition(target) ?? new vscode.Range(target, target);
            results.push({ depth: resolved.depth, link: {
              originSelectionRange: new vscode.Range(position.line, ref.start, position.line, ref.end),
              targetUri: uri, targetRange: range, targetSelectionRange: range
            } });
          }
        } catch {
          // An unreadable resource must not prevent navigation to other files.
        }
      }
      // Prefer the most specific match while preserving equally good duplicates.
      const deepest = Math.max(0, ...results.map(r => r.depth));
      return results.filter(r => r.depth === deepest).map(r => r.link);
    }
  };
  context.subscriptions.push(vscode.languages.registerDefinitionProvider([
    { language: 'python' }, { language: 'gherkin' }, { language: 'feature' },
    { pattern: '**/*.feature' }
  ], provider));
}
