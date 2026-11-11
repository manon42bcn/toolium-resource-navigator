import * as vscode from 'vscode';
import { placeholderMatches } from './resolver';

export function registerPlaceholderDecorations(context: vscode.ExtensionContext,
  selector: vscode.DocumentSelector): void {
  const underline = vscode.window.createTextEditorDecorationType({ textDecoration: 'underline dotted' });

  function refresh(editor: vscode.TextEditor): void {
    const { document } = editor;
    const ranges: vscode.Range[] = [];
    if (vscode.languages.match(selector, document) && vscode.workspace.getWorkspaceFolder(document.uri)) {
      const scannedLines = new Set<number>();
      for (const visible of editor.visibleRanges) {
        for (let line = visible.start.line; line <= visible.end.line && line < document.lineCount; line++) {
          if (scannedLines.has(line)) continue;
          scannedLines.add(line);
          for (const match of placeholderMatches(document.lineAt(line).text)) {
            const start = match.index!;
            ranges.push(new vscode.Range(line, start, line, start + match[0].length));
          }
        }
      }
    }
    editor.setDecorations(underline, ranges);
  }

  const refreshVisible = () => vscode.window.visibleTextEditors.forEach(refresh);
  context.subscriptions.push(
    underline,
    vscode.window.onDidChangeVisibleTextEditors(refreshVisible),
    vscode.window.onDidChangeTextEditorVisibleRanges(event => refresh(event.textEditor)),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshVisible),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!event.contentChanges.length) return;
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === event.document) refresh(editor);
      }
    })
  );
  refreshVisible();
}
