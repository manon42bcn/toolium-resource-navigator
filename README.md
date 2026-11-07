# Toolium Resource Navigator

Cmd/Ctrl+click or press F12 on `[LANG:var.foo.key]`, `[CONF:qa_openai.api_version]`, `[POE:bill:bill.check.genericCardText]`, `[FILE:path/to/file.txt]`, `[FILE_UTF8:path/to/file.txt]`, or `[BASE64:path/to/file.txt]` in Python or `.feature` files to navigate to the corresponding resource node or file. Toolium does not need to be installed, and the extension does not execute project code.

- Finds `.yaml` and `.yml` resources by their keys, regardless of the file name.
- Stops at dynamic segments (`<channel>`) or missing keys.
- Leaves language selection to you: navigation ends at the requested key.
- When several files match, returns the destinations with the deepest resolved path for VS Code to display.
- Reads the current document contents, including unsaved YAML changes. Invalid resource files are skipped.

For more information about Toolium, see the [official Toolium documentation](https://toolium.readthedocs.io/en/latest/).

## Development

Requires Node.js and npm.

```sh
npm install
npm test
```

Open this folder in VS Code and press F5. In the Extension Development Host window, open the project containing your features and resources. Try Cmd/Ctrl+click or F12 on a LANG reference.

## Resource configuration

In the resource project's `.vscode/settings.json`:

```json
{
  "tooliumResources.resourcePaths": ["acceptance/resources/language"],
  "tooliumResources.configurationPaths": ["acceptance/settings"],
  "tooliumResources.poeditorPaths": ["acceptance/resources/poeditor"],
  "tooliumResources.baseConfigurationFiles": [
    "global-properties.json",
    "common-properties.json"
  ]
}
```

Directories are relative to the workspace folder containing the source file. In multi-root workspaces, resources are searched within that folder. References must fit on a single line, and paths use dots as separators.

## CONF navigation

`[CONF:qa_openai.api_version]` navigates to the `api_version` key inside the
`qa_openai` JSON object. By default, the extension searches `acceptance/settings`.
All settings above are optional and show their defaults.

- Configured base filenames and public `*-properties.json` environment files are searched.
- `*-private-properties.json`, `*-private.json`, `private-properties.json`, and
  `private.json` are always excluded by filename before their contents are opened,
  even if listed as base files. The check is case-insensitive.
- If the key exists in multiple files, all destinations with the deepest resolved
  path are returned, with base files ordered first. VS Code controls how they appear.
- Dynamic or missing segments stop at the last resolved parent, as for LANG.
- Only strict JSON is supported; invalid JSON is skipped. Arrays are not traversed.
- Navigation does not select an active environment, merge configurations, or compute
  an effective value. If a key exists only in excluded files, no destination for
  that key is returned; a matching parent in a public file may still be offered.

## POE navigation

`[POE:bill:bill.check.genericCardText]` searches for the exact `reference` value
`bill:bill.check.genericCardText` in JSON arrays under `acceptance/resources/poeditor`.
Use `tooliumResources.poeditorPaths` to override the default directories.

```json
[
  {
    "term": "This month's bill is %1$s",
    "definition": "O valor da sua conta é %1$s",
    "reference": "bill:bill.check.genericCardText"
  }
]
```

Navigation targets the matching `reference` value, keeping the object's term and
definition nearby. All occurrences are returned, including the same reference in
multiple files. Colons and dots are treated literally, not as nested JSON paths.
POE does not resolve partial references or dynamic placeholders. Invalid JSON,
non-array roots, and entries without a matching string `reference` are skipped.

## FILE, FILE_UTF8, and BASE64 navigation

`[FILE:path/to/file.txt]` `[FILE_UTF8:path/to/file.txt]`, or `[BASE64:path/to/file.txt]` navigates to the beginning of
`acceptance/resources/path/to/file.txt` in the source document's workspace folder.
Any number of subdirectories and any file extension (or no extension) are supported.
The path uses `/` separators and is resolved directly, without searching by filename
or reading the target's contents during definition resolution.

The destination must exist and be a file. Directories, missing files, absolute
paths, URI schemes, backslashes, empty segments, and `.` or `..` segments produce
no destination. Paths are literal; dynamic placeholders are not expanded.
All three placeholders have identical navigation behavior; the extension does not decode
or load the target contents, and does not perform Base64 encoding.
The base directory is fixed at `acceptance/resources` and needs no configuration.

## Installation and sharing

```sh
npm run compile
npm run package
```

In VS Code, run `Extensions: Install from VSIX…` and select the generated file. Publishing to the Marketplace is not required.

## Initial scope

Files are discovered and parsed when a definition is requested, without a persistent index. This keeps the implementation simple and up to date; caching can be added later for very large repositories. The extension does not interpret Examples, YAML aliases, or keys containing literal dots. Autocompletion and hover previews are not included.
