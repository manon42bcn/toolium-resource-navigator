const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');

function fixture(text = '[LANG:screen.title]', targets = 1) {
  let hover, command;
  const definitions = [], opened = [], messages = [];
  let searches = 0;
  const document = { uri: uri('/repo/example.feature'), version: 1, lineCount: 1,
    languageId: 'gherkin', lineAt: () => ({ text }) };
  const vscode = createVscode({
    Position: class { constructor(line, character) { Object.assign(this, { line, character }); } },
    MarkdownString: class { constructor(value) { this.value = value; } },
    Hover: class { constructor(contents, range) { Object.assign(this, { contents, range }); } },
    ProgressLocation: { Notification: 15 },
    commands: { registerCommand: (id, handler) => { assert.equal(id, 'tooliumResources.openResource'); command = handler; return {}; } },
    languages: {
      registerDefinitionProvider: selector => { definitions.push(selector); return {}; },
      registerHoverProvider: (_, provider) => { hover = provider; return {}; }
    },
    workspace: {
      getWorkspaceFolder: () => ({ uri: uri('/repo') }),
      getConfiguration: () => ({ get: (_, fallback) => fallback }),
      asRelativePath: target => target.path,
      findFiles: async () => { searches++; return Array.from({ length: targets }, (_, i) => uri(`/repo/${i}.yml`)); },
      openTextDocument: async () => ({ getText: () => 'screen:\n  title: Value',
        positionAt: character => ({ line: 1, character }), getWordRangeAtPosition: () => undefined })
    },
    window: {
      activeTextEditor: { document, selection: { active: { line: 0, character: 3 } } },
      withProgress: async (_, work) => work({}, { isCancellationRequested: false }),
      showQuickPick: async items => items[1],
      showTextDocument: async (target, options) => opened.push({ target, options }),
      showInformationMessage: message => messages.push(message),
      showErrorMessage: message => { throw Error(message); }
    }
  });
  loadWithVscode('extension', vscode).activate({ subscriptions: [] });
  return { hover, command, definitions, opened, messages, document, searches: () => searches };
}

test('hover is lightweight for every placeholder kind and trusts only the direct command', () => {
  for (const text of ['[LANG:screen.<name>]', '[CONF:screen.title]', '[POE:screen:title]',
    '[FILE:a.txt]', '[FILE_UTF8:a.txt]', '[BASE64:a.txt]', '[TOOLIUM:Section_option]']) {
    const f = fixture(text);
    const result = f.hover.provideHover(f.document, { line: 0, character: 3 });
    assert.match(result.contents.value, /command:tooliumResources.openResource/);
    assert.deepEqual(result.contents.isTrusted, { enabledCommands: ['tooliumResources.openResource'] });
    assert.equal(f.searches(), 0);
    assert.equal(f.definitions.length, 1); // Only reverse YAML navigation remains.
    assert.ok(f.definitions[0].every(item => !['python', 'feature', 'gherkin'].includes(item.language)));
  }
  const f = fixture('[LANG:screen.title');
  assert.equal(f.hover.provideHover(f.document, { line: 0, character: 3 }), undefined);
});

test('direct command opens a single result and selects among multiple results', async () => {
  const single = fixture();
  await single.command();
  assert.equal(single.opened[0].target.path, '/repo/0.yml');
  const multiple = fixture(undefined, 2);
  await multiple.command();
  assert.equal(multiple.opened[0].target.path, '/repo/1.yml');
});

test('hover command validates source version and placeholder before resolving', async () => {
  const f = fixture();
  const result = f.hover.provideHover(f.document, { line: 0, character: 3 });
  const encoded = result.contents.value.match(/\?([^)]*)\)/)[1];
  const [request] = JSON.parse(decodeURIComponent(encoded));
  f.document.version++;
  await f.command(request);
  assert.equal(f.searches(), 0);
  f.document.version--;
  await f.command({ ...request, text: '[LANG:other]' });
  assert.equal(f.searches(), 0);
  await f.command(request);
  assert.equal(f.opened.length, 1);
});

test('direct command explains missing references and missing targets', async () => {
  const noReference = fixture('plain text');
  await noReference.command();
  assert.equal(noReference.searches(), 0);
  assert.equal(noReference.messages.length, 1);
  const noTarget = fixture(undefined, 0);
  await noTarget.command();
  assert.equal(noTarget.opened.length, 0);
  assert.equal(noTarget.messages.length, 1);
});
