const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');

function fixture(file, text, selected, uses, settings = {}) {
  let provider;
  let reads = 0;
  const vscode = createVscode({
    languages: { registerReferenceProvider: (_, value) => { provider = value; return {}; } },
    workspace: {
      getWorkspaceFolder: () => ({ uri: uri('/repo') }),
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
      findFiles: async () => [uri('/repo/acceptance/features/example.feature'), uri('/repo/acceptance/common/example.py')],
      openTextDocument: async () => { reads++; return { getText: () => uses, positionAt: value => value }; }
    }
  });
  loadWithVscode('usages', vscode).registerUsageProviders({ subscriptions: [] });
  return { run: () => provider.provideReferences({ uri: uri('/repo/' + file), getText: () => text,
    offsetAt: () => text.indexOf(selected) }, {}, {}, { isCancellationRequested: false }), reads: () => reads };
}

test('CONF reverse searches exact keys, descendants and negative array indices in Python and feature files', async () => {
  const text = '{"services":[{"name":"one"},{"name":"two"}]}';
  const uses = '[CONF:services.1.name] [CONF:services.-1.name] [CONF:services.0.name] [CONF:services_extra] [LANG:services]';
  assert.equal((await fixture('acceptance/settings/common-properties.json', text, '"services"', uses).run()).length, 6);
  assert.equal((await fixture('acceptance/settings/common-properties.json', text, '"name":"two"', uses).run()).length, 4);
  assert.equal((await fixture('acceptance/settings/common-properties.json', text, '"two"', uses).run()).length, 0);
});

test('CONF private, unconfigured and invalid resources do not trigger usage scans', async () => {
  for (const [file, text, settings] of [
    ['acceptance/settings/private.json', '{"key":1}', {}],
    ['elsewhere/common-properties.json', '{"key":1}', {}],
    ['acceptance/settings/common-properties.json', '{"key":,}', {}],
    ['acceptance/settings/common-properties.json', '{"key":1}', { configurationPaths: [] }]
  ]) {
    const f = fixture(file, text, 'key', '[CONF:key]', settings);
    assert.deepEqual(await f.run(), []);
    assert.equal(f.reads(), 0);
  }
});

test('POE reverse uses identifier values, literal dots and configured prefixes/contains mode', async () => {
  const text = '[{"reference":"app:mobile.screen.title","definition":"value"}]';
  const uses = '[POE:app:screen.title] [POE:app:mobile.screen.title] [POE:app:screen] [POE:app:screen.title.child]';
  const f = fixture('acceptance/resources/poeditor/text.json', text, 'app:mobile.screen.title', uses,
    { poeditorPrefixes: ['mobile.'] });
  assert.equal((await f.run()).length, 4);
  assert.equal((await fixture('acceptance/resources/poeditor/text.json', text, 'value', uses).run()).length, 0);
  assert.equal((await fixture('acceptance/resources/poeditor/text.json', text, 'app:mobile.screen.title', uses,
    { poeditorSearchType: 'contains' }).run()).length, 2);
  const custom = '[{"id":"screen.title"}]';
  assert.equal((await fixture('acceptance/resources/poeditor/text.json', custom, 'screen.title', '[POE:screen.title]',
    { poeditorKeyField: 'id' }).run()).length, 2);
});

test('TOOLIUM reverse searches explicit options or a section and respects colon encoding and continuations', async () => {
  const text = '[Execution]\nmode: QA\napi___url = value\n  continuation: text\n[Other]\nmode=DEV\n';
  const uses = '[TOOLIUM:Execution_mode] [TOOLIUM:Execution_api:url] [TOOLIUM:Execution_missing] [TOOLIUM:Other_mode]';
  assert.equal((await fixture('acceptance/settings/toolium.cfg', text, 'Execution', uses).run()).length, 4);
  assert.equal((await fixture('acceptance/settings/local-toolium.cfg', text, 'api___url', uses).run()).length, 2);
  assert.equal((await fixture('acceptance/settings/toolium.cfg', text, 'continuation', uses).run()).length, 0);
  assert.equal((await fixture('acceptance/settings/toolium.cfg', text, 'value', uses).run()).length, 0);
  assert.equal((await fixture('acceptance/settings/nested/toolium.cfg', text, 'mode', uses).run()).length, 0);
});
