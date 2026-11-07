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
test('YAML offsets support quoted keys and multiline resources', () => {
  const text = 'var:\n  "foo": |\n    a\n    b\n';
  assert.deepEqual(resolveYaml(text,['var','foo']),{offset:text.indexOf('"foo"'),depth:2});
});
