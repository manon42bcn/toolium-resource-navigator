const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveYaml, referenceAt } = require('../out/resolver');
const source = 'var:\n  foo:\n    key:\n      pt-br: "Olá"\n    Chat:\n      en: hello\n';
test('complete path selects the key, not the language', () => {
  assert.deepEqual(resolveYaml(source, ['var','foo','key']), {offset:source.indexOf('key:'),depth:3});
});
test('dynamic and missing segments stop at the last known parent', () => {
  for (const path of [['var','foo','<example>'],['var','foo','missing']]) {
    assert.deepEqual(resolveYaml(source,path), {offset:source.indexOf('foo:'),depth:2});
  }
});
test('unknown roots and invalid YAML do not produce destinations', () => {
  assert.equal(resolveYaml(source,['unknown']),undefined);
  assert.equal(resolveYaml('var: [', ['var']),undefined);
});
test('references are selected independently in Python and feature text', () => {
  const line = '"[LANG:var.foo.key] [LANG:var.foo.<channel>]"';
  assert.deepEqual(referenceAt(line, 4).path,['var','foo','key']);
  assert.deepEqual(referenceAt(line, 25).path,['var','foo','<channel>']);
  assert.equal(referenceAt(line, 0),undefined);
});
test('bare references preserve values and ranges for every supported kind', () => {
  for (const bare of ['LANG:var.foo.key::pt-br', 'CONF:services.-1.name',
    'POE:bill:bill.check', 'FILE:nested/file.txt', 'FILE_UTF8:nested/file.txt',
    'BASE64:nested/file.bin', 'TOOLIUM:Section_option:part']) {
    const line = `Given "${bare}", [LANG:other]`;
    const ref = referenceAt(line, 8);
    assert.equal(line.slice(ref.start, ref.end), bare);
    assert.deepEqual(ref.path, referenceAt(`[${bare}]`, 1).path);
    assert.equal(ref.kind, bare.split(':')[0]);
    assert.equal(referenceAt(line, ref.end), undefined);
  }
  assert.deepEqual(referenceAt('Given LANG:var.foo.', 8).path, ['var', 'foo']);
  for (const line of ['[LANG:var.foo', 'MY_LANG:var.foo', 'LANG:var.<dynamic>', 'LANG:var.foo::']) {
    assert.equal(referenceAt(line, line.indexOf('LANG')), undefined);
  }
});
test('YAML offsets support quoted keys and multiline resources', () => {
  const text = 'var:\n  "foo": |\n    a\n    b\n';
  assert.deepEqual(resolveYaml(text,['var','foo']),{offset:text.indexOf('"foo"'),depth:2});
});
