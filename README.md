# Toolium Resource Navigator

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

Copyright 2026 Manuel Porras Ojeda <manuel.porras.ojeda@gmail.com>.

Cmd/Ctrl+click or press F12 on `[LANG:var.foo.key]`, `[CONF:qa_openai.api_version]`, `[POE:bill:bill.check.genericCardText]`, `[FILE:path/to/file.txt]`, `[FILE_UTF8:path/to/file.txt]`, `[BASE64:path/to/file.txt]`, or `[TOOLIUM:TestExecution_environment]` in Python or `.feature` files to navigate to the corresponding resource node or file. Toolium does not need to be installed, and the extension does not execute project code.

- Finds `.yaml` and `.yml` resources by their keys, regardless of the file name.
- LANG/CONF navigation stops at dynamic segments (`<channel>`) or missing keys.
- LANG without an explicit language ends at the resource key; `::en` selects its `en` child.
- When several LANG/CONF files match, returns the destinations with the deepest resolved path for VS Code to display.
- Reads the current document contents, including unsaved YAML changes. Invalid resource files are skipped.

For more information about Toolium, see the [official Toolium documentation](https://toolium.readthedocs.io/en/latest/).

## Development

Requires Node.js 24.x and npm. The development Node.js major version is declared
in `.nvmrc` and `package.json`; maintenance updates within 24.x are supported.
If you use nvm, select it before installing dependencies:

```sh
nvm install
nvm use
npm ci
npm test
```

With another Node.js installation method, select Node.js 24.x and run `npm ci`
and `npm test` directly.

The packaging tool uses a scoped `minimatch` override to require version 11.0.1
or newer, fixing [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Remove this override when `@vscode/vsce` declares a patched version itself.

Open this folder in VS Code and press F5. In the Extension Development Host window, open the project containing your features and resources. Try Cmd/Ctrl+click or F12 on a LANG reference.

## LANG and CONF completion

Type `:` or `.` inside a LANG/CONF placeholder to request suggestions, or use
**Ctrl+Space** to invoke completion manually in Python and `.feature` files.
Placeholders do not need a closing `]` while editing.

| Input before the cursor | Suggestions |
| --- | --- |
| `[LANG:` | Root YAML keys |
| `[LANG:home.` | Immediate children of `home` |
| `[LANG:home.button.s` | Child keys starting with `s` |
| `[LANG:home.button.send::` | Available language keys, such as `en` or `pt-br` |
| `[CONF:` | Public configuration root keys |
| `[CONF:services.` | Child keys, or nonnegative array indices |
| `[CONF:services.0.` | Keys inside the first array element |

Completion uses the same configured folders and private-file exclusions as
navigation. Identical labels from several files are combined into one suggestion,
with workspace-relative source paths shown in its details. Resource values are not
displayed by completion. Unsaved resource edits are included.

Only the segment under the cursor is replaced, including an existing suffix;
the rest of the path and any closing bracket are preserved. Suggestions are
case-sensitive and require an exact parent path: missing or dynamic parents do
not fall back to another level.

LANG treats terminal mappings whose keys look like language tags (`en`, `pt-br`,
etc.) as language groups. Their children are offered after `::`, rather than as
ordinary dotted path segments. This is a structural heuristic, not an active-language
setting or a complete language registry. YAML aliases are not followed.

Completion is currently limited to LANG/CONF. POE and file placeholders retain
their existing navigation. No persistent index or cache is used: files are discovered
and parsed on demand, and cancelled requests stop without returning partial results.

## Resource configuration

All settings are optional. The following example lists every extension setting
with its default value; you do not need to copy it to use the defaults.
To override them, set only the options you need in the resource project's
`.vscode/settings.json`:

```json
{
  "tooliumResources.resourcePaths": ["acceptance/resources/language"],
  "tooliumResources.configurationPaths": ["acceptance/settings"],
  "tooliumResources.tooliumPaths": ["acceptance/settings"],
  "tooliumResources.poeditorPaths": ["acceptance/resources/poeditor"],
  "tooliumResources.poeditorSearchType": "exact",
  "tooliumResources.poeditorKeyField": "reference",
  "tooliumResources.poeditorPrefixes": [],
  "tooliumResources.filePath": "acceptance/resources",
  "tooliumResources.base64Path": "acceptance/resources",
  "tooliumResources.baseConfigurationFiles": [
    "global-properties.json",
    "common-properties.json"
  ],
  "tooliumResources.enableUsageNavigation": true,
  "tooliumResources.referencePaths": ["acceptance/common", "acceptance/features"]
}
```

The option names below all use the `tooliumResources.` prefix.

| Option | Default | Purpose |
| --- | --- | --- |
| `resourcePaths` | `["acceptance/resources/language"]` | LANG navigation and completion: recursively search `.yaml` and `.yml` files. Also identifies the YAML files eligible for usage navigation and Find All References. |
| `configurationPaths` | `["acceptance/settings"]` | CONF navigation and completion: recursively search public JSON configuration files. |
| `baseConfigurationFiles` | `["global-properties.json", "common-properties.json"]` | CONF base filenames, ordered before public environment files when returning definitions. Private filenames are always excluded. |
| `poeditorPaths` | `["acceptance/resources/poeditor"]` | POE navigation: recursively search JSON files containing arrays of terms. |
| `tooliumPaths` | `["acceptance/settings"]` | TOOLIUM navigation: check only `toolium.cfg` and `local-toolium.cfg` directly inside each directory. |
| `filePath` | `"acceptance/resources"` | Base directory for FILE and FILE_UTF8 targets; resolve the exact file without a recursive search. |
| `base64Path` | `"acceptance/resources"` | Independent base directory for BASE64 targets; resolve the exact file without a recursive search. |
| `poeditorSearchType` | `"exact"` | POE matching mode: `exact` or `contains`, both case-sensitive. |
| `poeditorKeyField` | `"reference"` | POEditor object field containing the identifier to match. |
| `poeditorPrefixes` | `[]` | Ordered prefixes tried before the unprefixed POE identifier. The first prefix with matches across all files wins. |
| `enableUsageNavigation` | `true` | Enable Go to Definition from a language YAML key to its LANG usages. Does not disable Find All References. |
| `referencePaths` | `["acceptance/common", "acceptance/features"]` | Recursively search `.py` and `.feature` files for literal LANG usages of a YAML key. |

Configured directories are relative to the workspace folder containing the source
document. For usage searches, this is the folder containing the language YAML
document. In multi-root workspaces, the search uses that folder as its root.
The default directories are specific folders under `acceptance/`, not a search
of every file under `acceptance/`.

### Overrides and empty values

Configured arrays replace their defaults; they are not appended to them.
The meaning of an empty value depends on the option:

| Configuration | Effect |
| --- | --- |
| No override | Use the setting's default value. |
| `"tooliumResources.resourcePaths": ["custom/language"]` | Search `custom/language` instead of `acceptance/resources/language`. |
| `"tooliumResources.resourcePaths": [""]` | Search YAML resources recursively from the workspace root. |
| `"tooliumResources.referencePaths": [""]` | Search Python and feature files recursively from the workspace root. |
| `"tooliumResources.resourcePaths": []` | Disable LANG resource discovery and completion, and usage searches from YAML keys. |
| `"tooliumResources.referencePaths": []` | Disable both usage navigation and Find All References; LANG resource navigation and completion remain available. |
| `"tooliumResources.baseConfigurationFiles": []` | Remove base-file classification; public `*-properties.json` environment files are still searched. |
| `"tooliumResources.poeditorPrefixes": []` | Match the unprefixed POE identifier only. |
| `"tooliumResources.filePath": ""` | Resolve FILE and FILE_UTF8 targets from the workspace root. |
| `"tooliumResources.base64Path": ""` | Resolve BASE64 targets from the workspace root. |

The directory-list options (`resourcePaths`, `configurationPaths`, `poeditorPaths`,
`tooliumPaths`, and `referencePaths`) all accept `[""]` for the workspace root and
`[]` to disable their search. TOOLIUM still checks only its two fixed filenames,
even when its base is the workspace root. Entries containing absolute paths,
colons (including URI schemes), backslashes, or `..` segments are ignored in
these directory lists. These rules do not describe `baseConfigurationFiles` or
`poeditorPrefixes`, which contain filenames and identifier prefixes, respectively.

References must fit on a single line. LANG/CONF key paths use dots, file references
use `/`, POE identifiers retain literal dots and colons, and TOOLIUM uses the first
underscore to separate the section from the option.

## Explicit LANG languages

`[LANG:home.button.send::en]` follows `home → button → send → en` in YAML.
The first `::` separates the resource path from the explicit language key.
Without this suffix, navigation still stops at `send`, with no automatic language
selection. Missing or dynamic segments retain the deepest existing parent fallback.

## CONF navigation

`[CONF:qa_openai.api_version]` navigates to the `api_version` key inside the
`qa_openai` JSON object. By default, the extension searches `acceptance/settings`.

- Configured base filenames and public `*-properties.json` environment files are searched.
- `*-private-properties.json`, `*-private.json`, `private-properties.json`, and
  `private.json` are always excluded by filename before their contents are opened,
  even if listed as base files. The check is case-insensitive.
- If the key exists in multiple files, all destinations with the deepest resolved
  path are returned, with base files ordered first. VS Code controls how they appear.
- Dynamic or missing segments stop at the last resolved parent, as for LANG.
- Only strict JSON is supported; invalid JSON is skipped.
- Arrays support integer indices: `[CONF:services.0.name]` selects the first service.
  Negative indices count from the end (`-1` is last), as in Toolium/Python.
  Invalid or out-of-range indices stop at the last resolved parent.
- Navigation does not select an active environment, merge configurations, or compute
  an effective value. If a key exists only in excluded files, no destination for
  that key is returned; a matching parent in a public file may still be offered.

## POE navigation

`[POE:bill:bill.check.genericCardText]` searches for the configured key-field value
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
definition nearby. All matching occurrences for the selected prefix are returned, including matches in
multiple files. Colons and dots are treated literally, not as nested JSON paths.
POE does not resolve partial references or dynamic placeholders. Invalid JSON,
non-array roots, and entries without a matching string `reference` are skipped.

### POE matching settings

- `poeditorSearchType`: `exact` (extension default) or `contains` (Toolium default).
  Contains matches are case-sensitive substrings, not regular expressions.
- `poeditorKeyField`: object field to inspect, default `reference`.
- `poeditorPrefixes`: ordered prefixes, followed by the unprefixed identifier.
  The first prefix with matches across all resource files wins. For `bill:key`,
  prefix `mobile.` produces `bill:mobile.key`; for `key` it produces `mobile.key`.
  This follows Toolium's first/second colon-component construction for prefixed
  identifiers; unprefixed identifiers are preserved in full.

Settings are explicit: the extension does not execute Python or infer runtime
POEditor configuration. It locates matching fields regardless of `definition`
contents; Toolium's empty-translation filtering is not evaluated.

## FILE, FILE_UTF8, and BASE64 navigation

`[FILE:path/to/file.txt]`, `[FILE_UTF8:path/to/file.txt]`, or `[BASE64:path/to/file.txt]` navigates to the beginning of
`acceptance/resources/path/to/file.txt` in the source document's workspace folder.
Any number of subdirectories and any file extension (or no extension) are supported.
The path uses `/` separators and is resolved directly, without searching by filename
or reading the target's contents during definition resolution.

The destination must exist and be a file. Directories, missing files, absolute
paths, URI schemes, backslashes, empty segments, and `.` or `..` segments produce
no destination. Paths are literal; dynamic placeholders are not expanded.
All three placeholders have identical navigation behavior; the extension does not decode
or load the target contents, and does not perform Base64 encoding.
Both bases default to `acceptance/resources`. Override `tooliumResources.filePath`
for FILE and FILE_UTF8, and `tooliumResources.base64Path` independently for BASE64.
The directories are relative to the source document's workspace folder; an empty
string selects the workspace root. Existing projects need no configuration.
These settings describe the bases you set with Toolium's `set_file_path()` and
`set_base64_path()`; the extension does not execute those calls.

## TOOLIUM navigation

`[TOOLIUM:TestExecution_environment]` navigates to `environment` within the
`[TestExecution]` section of a CFG file:

```ini
[TestExecution]
environment: QA
```

By default, only `acceptance/settings/toolium.cfg` and
`acceptance/settings/local-toolium.cfg` are searched, relative to the workspace
folder containing the source document. Set `tooliumResources.tooliumPaths` to
replace the default directory (or provide several directories); the two filenames
remain fixed and subdirectories are not searched.

- The first `_` separates the section from the option; further underscores belong
  to the option name. Sections and options are case-sensitive.
- Options using `:` or `=` as the delimiter are supported. A colon within an option
  name maps to `___` in the CFG, following Toolium's encoding.
- Matching definitions from both files are returned. Missing files are skipped;
  a section without the requested option is not a destination.
- Full-line `#` and `;` comments and indented multiline value continuations are ignored.
- Navigation locates explicit definitions only. It does not calculate effective
  values, merge files, evaluate interpolation or environment overrides, or follow
  inherited DEFAULT options. Unsaved CFG edits are included.

## Installation and sharing

```sh
npm run package
```

Packaging automatically compiles the TypeScript sources through `vscode:prepublish`.
If compilation fails, no VSIX is generated.

Packages are written to `dist/toolium-resource-navigator-<version>.vsix`, using the
version in `package.json`. The `dist/` directory is created automatically and is
excluded from Git and from the extension package.

In VS Code, run `Extensions: Install from VSIX…` and select the generated file
inside `dist/`. Publishing to the Marketplace is not required.

Source code, tests, editor configuration, `.nvmrc`, `package.json`, and
`package-lock.json` belong in Git. Generated `out/`, `dist/`, `node_modules/`,
and VSIX files do not. A clean checkout is built with `npm ci`, `npm test`, and
`npm run package`.

## GitHub Actions and releases

The workflow in `.github/workflows/build.yml` runs on pull requests targeting
`main`, pushes to `main`, version-tag pushes (`v*`), and manual runs from Actions.
It selects Node.js from `.nvmrc`, installs dependencies with `npm ci`, runs the
tests, packages the extension, and saves a `vsix` artifact for 14 days.
Download it from **Actions → workflow run → Artifacts → vsix** and extract the
VSIX before installing it.

Pushing a version tag also creates a GitHub Release after the build succeeds,
attaching the same VSIX produced by that build. The tag must equal `v` followed
by the version in both `package.json` and `package-lock.json`. Release assets
remain available independently of the Actions artifact's retention period.
The workflow uses GitHub's built-in token; no Marketplace token is needed.

### Create a release

First commit and push the project files, including all new source files, tests,
and the workflow. Ensure the intended release commit is on `main` and its Actions
build succeeds. Actions must be enabled for the repository, with repository or
organization policies allowing the release job to write repository contents.

For the current `0.8.0` version, create and push a tag on that commit:

```sh
git switch main
git pull --ff-only
git tag -a v0.8.0 -m "Release v0.8.0"
git push origin v0.8.0
```

Run these commands with a clean working tree. Tags identify committed code;
uncommitted local changes are not included. The tag must not already exist.
Then follow the tag's run in **Actions**. On success, the VSIX is available under
**Releases → v0.8.0 → Assets**. The workflow creates the release; do not create a
release manually for the same tag beforehand.

For subsequent releases, update the version and lockfile without creating a tag:

```sh
npm version patch --no-git-tag-version
```

This changes `0.8.0` to `0.8.1`. Review, commit, and push the version changes along
with the release's code, then create and push the matching `v0.8.1` tag. Use
`minor` or `major` instead of `patch` when appropriate.

GitHub Release creation is documented in the
[GitHub CLI manual](https://cli.github.com/manual/gh_release_create).
This workflow distributes VSIX files through GitHub; it does not publish to the
Visual Studio Marketplace.

## Initial scope

Files are discovered and parsed when navigation or completion is requested, without a persistent index. This keeps the implementation simple and up to date; caching can be added later for very large repositories. The extension does not interpret Examples, YAML aliases, or keys containing literal dots. LANG/CONF completion is included; hover previews are not yet implemented.

## Find language resource usages

Cmd/Ctrl+click a mapping key in a configured language YAML file to navigate to
its exact literal LANG usages. Right-click **Find All References** to list usages.
Only Python and `.feature` files inside the same workspace folder are searched,
recursively under `acceptance/common` and `acceptance/features` by default.
The search runs on demand and reads unsaved document contents.

```json
{
  "tooliumResources.enableUsageNavigation": true,
  "tooliumResources.referencePaths": ["acceptance/common", "acceptance/features"]
}
```

Disable `enableUsageNavigation` to turn off Cmd/Ctrl+click usage navigation while
keeping Find All References. Set `referencePaths` to `[]` to disable both searches.
Place the cursor on the key, not its value. Matching uses the complete mapping
path; explicit `::language` references are also recognized for that full path.
Dynamic references, aliases, sequence entries and keys containing literal dots
are not expanded. Multiple destinations follow VS Code's navigation settings.
