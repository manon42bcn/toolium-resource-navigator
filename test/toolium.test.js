const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');
const { referenceAt, resolveToolium } = require('../out/resolver');

test('TOOLIUM detection preserves section, underscores, and option colons', () => {
  const ref = referenceAt('[TOOLIUM:Capabilities_selenoid:options]', 10);
  assert.equal(ref.kind, 'TOOLIUM');
  assert.equal(ref.value, 'Capabilities_selenoid:options');
});

test('CFG resolution splits at the first underscore and accepts either delimiter', () => {
  const source = '[TestExecution]\r\nenvironment: QA\r\n  some_option = value\r\n';
  assert.deepEqual(resolveToolium(source, 'TestExecution_environment'), [
    {offset: source.indexOf('environment:'), depth: 2}
  ]);
  // Start a new section to make the indented option a definition, not a continuation.
  const indented = '[TestExecution]\n  some_option = value';
  assert.deepEqual(resolveToolium(indented, 'TestExecution_some_option'), [
    {offset: indented.indexOf('some_option'), depth: 2}
  ]);
});

test('CFG resolution ignores comments, continuation values, and other sections', () => {
  const source = '[Other]\nenvironment: wrong\n[TestExecution]\n# environment: ignored\n; environment=ignored\ntext: multiline\n  environment: continuation\nenvironment = QA\n';
  assert.deepEqual(resolveToolium(source, 'TestExecution_environment'), [
    {offset: source.lastIndexOf('environment ='), depth: 2}
  ]);
});

test('CFG sections and options are case-sensitive and missing options have no fallback', () => {
  const source = '[TestExecution]\nenvironment: QA';
  for (const ref of ['testexecution_environment', 'TestExecution_Environment',
    'TestExecution_missing', 'TestExecution', '_environment', 'TestExecution_']) {
    assert.deepEqual(resolveToolium(source, ref), []);
  }
});

test('Toolium option colon encoding matches CFG triple underscores', () => {
  const source = '[Capabilities]\nselenoid___options: value';
  assert.deepEqual(resolveToolium(source, 'Capabilities_selenoid:options'), [
    {offset: source.indexOf('selenoid'), depth: 2}
  ]);
});

test('TOOLIUM provider uses only the two CFG files in default or configured workspace directories', async () => {
  for (const configured of [undefined, ['custom/settings']]) {
    const directory = configured?.[0] ?? 'acceptance/settings';

    const opened = [];
    let provider;
    let missingLocal = false;
    const vscode = createVscode({
      workspace: {
        getWorkspaceFolder: () => ({uri: uri('/repo')}),
        getConfiguration: () => ({get: (name, fallback) =>
          name === 'tooliumPaths' && configured ? configured : fallback}),
        openTextDocument: async resource => {
          opened.push(resource.path);
          assert.ok(resource.path === `/repo/${directory}/toolium.cfg`
            || resource.path === `/repo/${directory}/local-toolium.cfg`);
          if (missingLocal && resource.path.endsWith('/local-toolium.cfg')) throw Error('Not found');
          return {
            getText: () => '[TestExecution]\nenvironment: QA',
            positionAt: offset => ({line: 1, character: offset - '[TestExecution]\n'.length}),
            getWordRangeAtPosition: () => undefined
          };
        }
      },
      languages: {registerDefinitionProvider: (_, value) => {provider = value; return {dispose() {}};}}
    });
    loadWithVscode('extension', vscode).activate({ subscriptions: [] });
    const resolve = () => provider.provideDefinition({
      uri: uri('/repo/example.feature'),
      lineAt: () => ({text: '[TOOLIUM:TestExecution_environment]'})
    }, {line: 0, character: 10}, {isCancellationRequested: false});
    const links = await resolve();
    assert.deepEqual(links.map(link => link.targetUri.path).sort(), [
      `/repo/${directory}/local-toolium.cfg`, `/repo/${directory}/toolium.cfg`
    ]);
    assert.equal(opened.length, 2);
    missingLocal = true;
    assert.equal((await resolve()).length, 1);
  }
});
