import { registerUsageProviders } from './usages';
import { findResourceFiles } from './resources';
import { completionProvider } from './completionProvider';
import * as vscode from 'vscode';
import { filePathSegments, referenceAt, resolveJson, resolvePoe, resolveToolium, resolveYaml } from './resolver';

/**
 * Registers LANG, CONF, POE, FILE, FILE_UTF8, BASE64, and TOOLIUM navigation and LANG/CONF completion for Python and Gherkin documents.
 * VS Code calls this entry point when the extension is activated; the context
 * owns the provider registration and disposes it when the extension unloads.
 *
 * @param context - Extension lifecycle context supplied by VS Code.
 */
export const resourceProvider: vscode.DefinitionProvider = {
    /**
     * Resolves the LANG, CONF, POE, FILE, FILE_UTF8, BASE64, or TOOLIUM reference against configured resource folders
     * in the source document's workspace folder. Reads current document contents
     * and returns a FILE/FILE_UTF8/BASE64 target, exact POE/TOOLIUM matches, or the deepest LANG/CONF paths.
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
      const config = vscode.workspace.getConfiguration('tooliumResources', document.uri);
      if (ref.kind === 'FILE' || ref.kind === 'FILE_UTF8' || ref.kind === 'BASE64') {
        const segments = filePathSegments(ref.value);
        if (!segments || token.isCancellationRequested) return [];
        const basePath = config.get<string>(ref.kind === 'BASE64' ? 'base64Path' : 'filePath',
          'acceptance/resources');
        const targetUri = vscode.Uri.joinPath(folder.uri, basePath, ...segments);
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
      const isToolium = ref.kind === 'TOOLIUM';
      const isConf = ref.kind === 'CONF';
      const isPoe = ref.kind === 'POE';
      const candidates = await findResourceFiles(document.uri, ref.kind, token);
      const results: { depth: number; priority: number; link: vscode.DefinitionLink }[] = [];
      for (const uri of candidates) {
        if (token.isCancellationRequested) return;
        try {
          const resource = await vscode.workspace.openTextDocument(uri);
          if (token.isCancellationRequested) return;
          const text = resource.getText();
          const resolvedPath = (isPoe || isToolium) ? undefined : (isConf ? resolveJson : resolveYaml)(text, ref.path);
          const matches = isToolium ? resolveToolium(text, ref.value)
            : isPoe ? resolvePoe(text, ref.value, {
              searchType: config.get<'exact' | 'contains'>('poeditorSearchType', 'exact'),
              keyField: config.get<string>('poeditorKeyField', 'reference'),
              prefixes: config.get<string[]>('poeditorPrefixes', [])
            }) : resolvedPath ? [resolvedPath] : [];
          for (const resolved of matches) {
            const target = resource.positionAt(resolved.offset);
            const range = resource.getWordRangeAtPosition(target) ?? new vscode.Range(target, target);
            results.push({ depth: resolved.depth, priority: resolved.priority ?? 0, link: {
              originSelectionRange: new vscode.Range(position.line, ref.start, position.line, ref.end),
              targetUri: uri, targetRange: range, targetSelectionRange: range
            } });
          }
        } catch {
          // An unreadable resource must not prevent navigation to other files.
        }
      }
      if (token.isCancellationRequested) return;
      // Prefer the most specific match while preserving equally good duplicates.
      if (isPoe) {
        const firstPrefix = results.reduce((best, result) => Math.min(best, result.priority), Infinity);
        return results.filter(r => r.priority === firstPrefix).map(r => r.link);
      }
      const deepest = results.reduce((best, result) => Math.max(best, result.depth), 0);
      return results.filter(r => r.depth === deepest).map(r => r.link);
    }
  };
export function activate(context: vscode.ExtensionContext): void {
  registerUsageProviders(context);
  const selector: vscode.DocumentSelector = [
    { language: 'python' }, { language: 'gherkin' }, { language: 'feature' },
    { pattern: '**/*.feature' }
  ];
  context.subscriptions.push(
    vscode.commands.registerCommand('tooliumResources.openResource', openResource),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const ref = referenceAt(document.lineAt(position.line).text, position.character);
        if (!ref || !vscode.workspace.getWorkspaceFolder(document.uri)) return;
        const args = encodeURIComponent(JSON.stringify([{
          uri: document.uri.toString(), line: position.line, character: ref.start,
          version: document.version, text: document.lineAt(position.line).text.slice(ref.start, ref.end)
        }]));
        const markdown = new vscode.MarkdownString(
          `[Open resource](command:tooliumResources.openResource?${args})`);
        markdown.isTrusted = { enabledCommands: ['tooliumResources.openResource'] };
        return new vscode.Hover(markdown,
          new vscode.Range(position.line, ref.start, position.line, ref.end));
      }
    }),
    vscode.languages.registerCompletionItemProvider(selector, completionProvider, ':', '.')
  );
}

interface ResourceRequest {
  uri: string;
  line: number;
  character: number;
  version: number;
  text: string;
}

/** Resolve directly: never invoke VS Code's aggregated definition commands. */
async function openResource(request?: ResourceRequest): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  let document: vscode.TextDocument;
  let position: vscode.Position;
  if (request !== undefined) {
    if (!request || typeof request.uri !== 'string' || typeof request.text !== 'string'
      || !Number.isInteger(request.line) || !Number.isInteger(request.character)
      || request.line < 0 || request.character < 0) return;
    // Hover links only operate on the still-active, unchanged source document.
    if (!editor || editor.document.uri.toString() !== request.uri
      || editor.document.version !== request.version || request.line >= editor.document.lineCount) return;
    document = editor.document;
    position = new vscode.Position(request.line, request.character);
    const line = document.lineAt(position.line).text;
    const ref = referenceAt(line, position.character);
    if (!ref || line.slice(ref.start, ref.end) !== request.text) return;
  } else {
    if (!editor) return;
    document = editor.document;
    position = editor.selection.active;
  }
  if (!['python', 'gherkin', 'feature'].includes(document.languageId)
    && !document.uri.path.endsWith('.feature')) return;
  if (!referenceAt(document.lineAt(position.line).text, position.character)) {
    void vscode.window.showInformationMessage('Place the cursor inside a Toolium resource placeholder.');
    return;
  }
  try {
    const links = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification, title: 'Finding Toolium resource', cancellable: true
    }, async (_progress, token) => {
      const result = await resourceProvider.provideDefinition(document, position, token);
      return token.isCancellationRequested ? undefined : result as vscode.DefinitionLink[] | undefined;
    });
    if (!links) return;
    if (!links.length) {
      void vscode.window.showInformationMessage('No matching Toolium resource found.');
      return;
    }
    const selected = links.length === 1 ? links[0] : (await vscode.window.showQuickPick(
      links.map(link => ({
        label: vscode.workspace.asRelativePath(link.targetUri),
        description: `Line ${(link.targetSelectionRange ?? link.targetRange).start.line + 1}`, link
      })), { placeHolder: 'Select a Toolium resource' }))?.link;
    if (selected) await vscode.window.showTextDocument(selected.targetUri,
      { selection: selected.targetSelectionRange });
  } catch {
    void vscode.window.showErrorMessage('Unable to open the Toolium resource.');
  }
}
