const Module = require('node:module');
const path = require('node:path');

const uri = value => ({ scheme: 'file', authority: '', path: value, toString: () => value });
class Range {
  constructor(...args) {
    this.args = args;
    if (args.length === 2) [this.start, this.end] = args;
    else {
      this.start = { line: args[0], character: args[1] };
      this.end = { line: args[2], character: args[3] };
    }
  }
}

/** Small API double; individual tests supply the workspace behavior they exercise. */
function createVscode(overrides = {}) {
  const disposable = () => ({ dispose() {} });
  return {
    Range,
    Location: class { constructor(uri, range) { this.uri = uri; this.range = range; } },
    FileType: { File: 1, Directory: 2 },
    Uri: { joinPath: (base, ...parts) => uri(path.posix.join(base.path, ...parts)) },
    RelativePattern: class {
      constructor(base, pattern) { this.base = base; this.pattern = pattern; }
    },
    CompletionItem: class { constructor(label, kind) { this.label = label; this.kind = kind; } },
    CompletionItemKind: { Property: 9, Value: 12 },
    ...overrides,
    languages: {
      registerDefinitionProvider: disposable,
      registerReferenceProvider: disposable,
      registerCompletionItemProvider: disposable,
      ...overrides.languages
    }
  };
}

/**
 * Load a fresh compiled module graph with a scoped VS Code double. Restore both
 * the loader and previous compiled-module cache even when loading fails.
 * Keep this synchronous: the global loader must never span an await.
 */
function loadWithVscode(name, vscode) {
  const outputRoot = path.resolve(__dirname, '../../out') + path.sep;
  const previous = new Map(Object.entries(require.cache).filter(([file]) => file.startsWith(outputRoot)));
  const originalLoad = Module._load;
  for (const file of previous.keys()) delete require.cache[file];
  try {
    Module._load = function(request, ...args) {
      return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args);
    };
    return require(path.join(outputRoot, name));
  } finally {
    Module._load = originalLoad;
    for (const file of Object.keys(require.cache)) {
      if (file.startsWith(outputRoot)) delete require.cache[file];
    }
    for (const [file, cached] of previous) require.cache[file] = cached;
  }
}

module.exports = { uri, createVscode, loadWithVscode };
