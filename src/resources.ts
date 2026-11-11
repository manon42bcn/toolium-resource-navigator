import * as vscode from 'vscode';
import { configurationFileKind } from './resolver';
import { configuredBases } from './paths';
import { configurationExcluded, defaultConfigurationExcludePatterns } from './configurationExclusions';

export type ResourceKind = 'LANG' | 'CONF' | 'POE' | 'TOOLIUM';

/**
 * Discovers navigation and completion resources in the source file's workspace.
 * Configured folders replace defaults. Excluded CONF filenames are rejected before
 * any document is opened, including files explicitly listed as bases.
 * Results are deduplicated; CONF base files are ordered before environments.
 */
export async function findResourceFiles(
  source: vscode.Uri, kind: ResourceKind, token: vscode.CancellationToken
): Promise<vscode.Uri[]> {
  const folder = vscode.workspace.getWorkspaceFolder(source);
  if (!folder) return [];
  const config = vscode.workspace.getConfiguration('tooliumResources', source);
  const settings = {
    LANG: ['resourcePaths', 'acceptance/resources/language'],
    CONF: ['configurationPaths', 'acceptance/settings'],
    POE: ['poeditorPaths', 'acceptance/resources/poeditor'],
    TOOLIUM: ['tooliumPaths', 'acceptance/settings']
  } as const;
  const [setting, fallback] = settings[kind];
  const paths = config.get<string[]>(setting, [fallback]);
  const baseFiles = config.get<string[]>('baseConfigurationFiles',
    ['global-properties.json', 'common-properties.json']);
  const files = new Map<string, vscode.Uri>();
  for (const base of configuredBases(folder.uri, paths)) {
    if (token.isCancellationRequested) return [];
    const discovered = kind === 'TOOLIUM'
      ? ['toolium.cfg', 'local-toolium.cfg'].map(name => vscode.Uri.joinPath(base, name))
      : await vscode.workspace.findFiles(new vscode.RelativePattern(base,
        kind === 'LANG' ? '**/*.{yaml,yml}' : '**/*.json'),
        '**/{node_modules,.git}/**', undefined, token);
    for (const uri of discovered) {
      const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);
      if (kind === 'CONF' && (configurationExcluded(
        uri.path.slice(folder.uri.path.replace(/\/$/, '').length + 1),
        config.get<string[]>('configurationExcludePatterns', defaultConfigurationExcludePatterns))
        || !configurationFileKind(name, baseFiles))) continue;
      files.set(uri.toString(), uri);
    }
  }
  return [...files.values()].sort((a, b) => {
    const rank = (uri: vscode.Uri) => configurationFileKind(
      uri.path.slice(uri.path.lastIndexOf('/') + 1), baseFiles) === 'base' ? 0 : 1;
    return (kind === 'CONF' ? rank(a) - rank(b) : 0) || a.toString().localeCompare(b.toString());
  });
}
