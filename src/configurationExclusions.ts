import { minimatch } from 'minimatch';

/** Defaults preserve the original private-filename exclusions, case-insensitively. */
export const defaultConfigurationExcludePatterns = [
  '**/private.json', '**/private-properties.json', '**/*-private.json', '**/*-private-properties.json'
];

/** Globs are workspace-relative; patterns without a slash match filenames at any depth. */
export function configurationExcluded(relativePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => typeof pattern === 'string' && pattern.length > 0
    && minimatch(relativePath, pattern, {
      nocase: true, dot: true, matchBase: true, nonegate: true, nocomment: true
    }));
}
