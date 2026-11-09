const {test} = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');
const source = 'login:\n  errors:\n    invalid: value\n';
const doc = {
  uri: uri('/repo/acceptance/resources/language/en.yml'),
  getText: () => source,
  offsetAt: () => source.indexOf('invalid')
};
const token = { isCancellationRequested: false };

function usageFixture(settings = {}) {
  let definition, references;
  const opened = [];
  const target = uri('/repo/acceptance/common/steps.py');
  const vscode = createVscode({
    languages: {
      registerDefinitionProvider: (_, provider) => { definition = provider; return {}; },
      registerReferenceProvider: (_, provider) => { references = provider; return {}; }
    },
    workspace: {
      getWorkspaceFolder: () => ({ uri: uri('/repo') }),
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
      findFiles: async pattern => {
        assert.equal(pattern.pattern, '**/*.{py,feature}');
        return [target, target, uri('/other/steps.py')];
      },
      openTextDocument: async resource => {
        opened.push(resource.path);
        return {
          getText: () => '[LANG:login.errors.invalid] [LANG:login.errors.invalid_extra]',
          positionAt: offset => offset
        };
      }
    }
  });
  const api = loadWithVscode('usages', vscode);
  api.registerUsageProviders({ subscriptions: [] });
  return { ...api, definition, references, opened };
}
const { yamlKeyAt, usageOffsets } = usageFixture();
test('YAML key detection follows nested and quoted keys and ignores values, aliases and invalid paths',()=>{
 assert.deepEqual(yamlKeyAt(source,source.indexOf('invalid')),['login','errors','invalid']);
 assert.equal(yamlKeyAt(source,source.indexOf('value')),undefined);
 assert.deepEqual(yamlKeyAt('"hello": value',2),['hello']);
 assert.equal(yamlKeyAt('"a.b": value',2),undefined);
 assert.equal(yamlKeyAt('a: [broken',0),undefined);
 assert.equal(yamlKeyAt('a: &x {b: value}\nc: *x',24),undefined);
});
test('exact uses preserve ranges and support explicit language without partial or dynamic matches',()=>{
 const text='[LANG:a.b] [LANG:a.b_extra] [LANG:a.<x>] [LANG:a::en]';
 assert.deepEqual(usageOffsets(text,['a','b']),[{start:0,end:10}]);
 assert.equal(usageOffsets(text,['a','en']).length,1);
});
test('usage providers deduplicate candidates and exclude files outside configured folders', async () => {
  const { definition, references, opened } = usageFixture();
  assert.equal((await definition.provideDefinition(doc, {}, token)).length, 1);
  assert.deepEqual(opened, ['/repo/acceptance/common/steps.py']);
  assert.equal((await references.provideReferences(doc, {}, {}, token)).length, 1);
});

test('disabling usage navigation leaves Find All References available', async () => {
  const { definition, references } = usageFixture({ enableUsageNavigation: false });
  assert.deepEqual(await definition.provideDefinition(doc, {}, token), []);
  assert.equal((await references.provideReferences(doc, {}, {}, token)).length, 1);
});

test('cancelled usage requests do not open documents', async () => {
  const { references, opened } = usageFixture();
  assert.deepEqual(await references.provideReferences(doc, {}, {}, { isCancellationRequested: true }), []);
  assert.deepEqual(opened, []);
});

test('YAML files outside resource folders do not trigger usage search', async () => {
  const { references, opened } = usageFixture();
  assert.deepEqual(await references.provideReferences({ ...doc, uri: uri('/repo/unrelated.yml') }, {}, {}, token), []);
  assert.deepEqual(opened, []);
});

test('an empty referencePaths list disables usage search', async () => {
  const { references, opened } = usageFixture({ referencePaths: [] });
  assert.deepEqual(await references.provideReferences(doc, {}, {}, token), []);
  assert.deepEqual(opened, []);
});
