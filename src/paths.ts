import * as vscode from 'vscode';

/** Resolves workspace-relative folders. An empty string selects the root; [] disables searching. */
export function configuredBases(folder: vscode.Uri, paths: string[]): vscode.Uri[] {
  return paths.filter(path => !path.startsWith('/') && !path.includes('\\')
    && !path.includes(':') && !path.split('/').includes('..'))
    .map(path => path === '' ? folder : vscode.Uri.joinPath(folder, path));
}
