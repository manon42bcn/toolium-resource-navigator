const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// Exercise the registered provider through a minimal VS Code API double so that
// discovery and the pre-read private-file exclusion are tested together.
test('CONF provider returns base and environment definitions without opening private files', async () => {
  const uri = path => ({path, toString: () => path});
  const base = uri('/repo/acceptance/settings/common-properties.json');
  const env = uri('/repo/acceptance/settings/dev-properties.json');
  const privateFiles = ['dev-private-properties.json', 'dev-private.json', 'private.json']
    .map(name => uri('/repo/acceptance/settings/' + name));
  const parentOnly = uri('/repo/acceptance/settings/other-properties.json');
  const opened = [];
  const patterns = [];
  let provider;
  class Range { constructor(...args) { this.args = args; } }
  const vscode = {
    Range,
    Uri: { joinPath: (folder, path) => uri(folder.path + '/' + path) },
    RelativePattern: class { constructor(base, pattern) { patterns.push({base, pattern}); } },
    workspace: {
      getWorkspaceFolder: () => ({uri: uri('/repo')}),
      getConfiguration: () => ({ get: (name, fallback) => name === 'baseConfigurationFiles'
        ? ['common-properties.json', 'dev-private.json'] : fallback }),
      findFiles: async () => [env, ...privateFiles, parentOnly, base],
      openTextDocument: async resource => {
        opened.push(resource.path);
        assert.ok(!privateFiles.some(file => file.path === resource.path), 'Private content must never be opened');
        return {
          getText: () => resource === parentOnly ? '{"qa_openai": {"other": 1}}'
            : '{"qa_openai": {"api_version": "value"}}',
          positionAt: offset => ({line: 0, character: offset}),
          getWordRangeAtPosition: () => undefined
        };
      }
    },
    languages: { registerDefinitionProvider: (_, value) => { provider = value; return {dispose() {}}; } }
  };
  const originalLoad = Module._load;
  try {
    Module._load = function(name, ...args) {
      return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args);
    };
    require('../out/extension').activate({subscriptions: []});
  } finally {
    Module._load = originalLoad;
  }
  const links = await provider.provideDefinition({
    uri: uri('/repo/example.feature'),
    lineAt: () => ({text: '[CONF:qa_openai.api_version]'})
  }, {line: 0, character: 10}, {isCancellationRequested: false});
  assert.deepEqual(links.map(link => link.targetUri.path), [base.path, env.path]);
  assert.equal(opened.length, 3);
  assert.equal(patterns[0].base.path, '/repo/acceptance/settings');
  assert.equal(patterns[0].pattern, '**/*.json');
});
