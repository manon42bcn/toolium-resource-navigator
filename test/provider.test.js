const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');

// Exercise the registered provider through a minimal VS Code API double so that
// discovery and the pre-read private-file exclusion are tested together.
test('CONF provider returns base and environment definitions without opening private files', async () => {

  const base = uri('/repo/acceptance/settings/common-properties.json');
  const env = uri('/repo/acceptance/settings/dev-properties.json');
  const privateFiles = ['dev-private-properties.json', 'dev-private.json', 'private.json']
    .map(name => uri('/repo/acceptance/settings/' + name));
  const parentOnly = uri('/repo/acceptance/settings/other-properties.json');
  const opened = [];
  const patterns = [];
  let provider;

  const vscode = createVscode({
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
  });
  provider = loadWithVscode('extension', vscode).resourceProvider;
  const links = await provider.provideDefinition({
    uri: uri('/repo/example.feature'),
    lineAt: () => ({text: '[CONF:qa_openai.api_version]'})
  }, {line: 0, character: 10}, {isCancellationRequested: false});
  assert.deepEqual(links.map(link => link.targetUri.path), [base.path, env.path]);
  assert.equal(opened.length, 3);
  assert.equal(patterns[0].base.path, '/repo/acceptance/settings');
  assert.equal(patterns[0].pattern, '**/*.json');
});

for (const { kind, reference, text, files } of [
  { kind: 'LANG', reference: 'home.title', text: 'home:\n  title: Hello', files: ['a.yml', 'b.yml'] },
  { kind: 'CONF', reference: 'home.title', text: '{"home":{"title":"Hello"}}',
    files: ['a-properties.json', 'b-properties.json'] },
  { kind: 'POE', reference: 'home.title', text: '[{"reference":"home.title"}]', files: ['a.json', 'b.json'] },
  { kind: 'TOOLIUM', reference: 'TestExecution_environment', text: '[TestExecution]\nenvironment: QA',
    files: ['local-toolium.cfg', 'toolium.cfg'] }
]) {
  for (const unreadable of [false, true]) {
    test(`${kind} discards earlier matches when cancelled during the last ${unreadable ? 'failed' : 'successful'} resource open`, async () => {
      const token = { isCancellationRequested: false };
      const opened = [];
      let reads = 0;
      let provider;
      let finishOpen;
      let signalLastOpen;
      const lastOpenStarted = new Promise(resolve => { signalLastOpen = resolve; });
      const lastResource = new Promise((resolve, reject) => {
        finishOpen = resource => unreadable ? reject(Error('Unreadable resource')) : resolve(resource);
      });
      const resource = {
        getText: () => { reads++; return text; },
        positionAt: character => ({ line: 0, character }),
        getWordRangeAtPosition: () => undefined
      };
      const vscode = createVscode({
        languages: { registerDefinitionProvider: (_, value) => { provider = value; return {}; } },
        workspace: {
          getWorkspaceFolder: () => ({ uri: uri('/repo') }),
          getConfiguration: () => ({ get: (_, fallback) => fallback }),
          findFiles: async () => files.map(name => uri('/repo/' + name)),
          openTextDocument: async target => {
            opened.push(target.path);
            if (opened.length === 2) {
              signalLastOpen();
              return lastResource;
            }
            return resource;
          }
        }
      });
      provider = loadWithVscode('extension', vscode).resourceProvider;
      const pending = provider.provideDefinition({
        uri: uri('/repo/example.feature'),
        lineAt: () => ({ text: `[${kind}:${reference}]` })
      }, { line: 0, character: 3 }, token);
      await lastOpenStarted;
      assert.equal(reads, 1, 'The first resource was processed before cancellation');
      token.isCancellationRequested = true;
      finishOpen(resource);
      assert.equal(await pending, undefined, 'Cancelled requests must discard earlier matches');
      assert.equal(reads, 1, 'The last resource must not be parsed after cancellation');
      assert.equal(opened.length, 2);
    });
  }
}
