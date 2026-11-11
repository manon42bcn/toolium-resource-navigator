# Toolium Resource Navigator

Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

Copyright 2026 Manuel Porras Ojeda <manuel.porras.ojeda@gmail.com>.

Hover and click **Open resource**, or run **Toolium: Open Resource** from the Command Palette with the cursor inside `[LANG:var.foo.key]`, `[CONF:qa_openai.api_version]`, `[POE:bill:bill.check.genericCardText]`, `[FILE:path/to/file.txt]`, `[FILE_UTF8:path/to/file.txt]`, `[BASE64:path/to/file.txt]`, or `[TOOLIUM:TestExecution_environment]` in Python or `.feature` files to navigate to the corresponding resource node or file. Toolium does not need to be installed, and the extension does not execute project code.

- Finds `.yaml` and `.yml` resources by their keys, regardless of the file name.
- LANG/CONF navigation stops at dynamic segments (`<channel>`) or missing keys.
- LANG without an explicit language ends at the resource key; `::en` selects its `en` child.
- When several LANG/CONF files match, offers the destinations with the deepest resolved path in a selector.
- Reads the current document contents, including unsaved YAML changes. Invalid resource files are skipped.

For more information about Toolium, see the [official Toolium documentation](https://toolium.readthedocs.io/en/latest/).

## Installation

Install **Toolium Resource Navigator** from the Extensions view in VS Code.
You can also download the VSIX from the [GitHub Releases page](https://github.com/manon42bcn/toolium-resource-navigator/releases)
and install it using **Extensions: Install from VSIX…**.

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

Completion uses the same configured folders and configurable file exclusions as
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
  "tooliumResources.configurationExcludePatterns": [
    "**/private.json", "**/private-properties.json",
    "**/*-private.json", "**/*-private-properties.json"
  ],
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
| `configurationPaths` | `["acceptance/settings"]` | CONF navigation and completion: recursively search eligible JSON configuration files. |
| `configurationExcludePatterns` | `["**/private.json", "**/private-properties.json", "**/*-private.json", "**/*-private-properties.json"]` | Case-insensitive CONF exclusion globs, applied before reading files. `[]` disables exclusions. |
| `baseConfigurationFiles` | `["global-properties.json", "common-properties.json"]` | CONF base filenames, ordered before environment files. Configured exclusion patterns take precedence. |
| `poeditorPaths` | `["acceptance/resources/poeditor"]` | POE navigation: recursively search JSON files containing arrays of terms. |
| `tooliumPaths` | `["acceptance/settings"]` | TOOLIUM navigation: check only `toolium.cfg` and `local-toolium.cfg` directly inside each directory. |
| `filePath` | `"acceptance/resources"` | Base directory for FILE and FILE_UTF8 targets; resolve the exact file without a recursive search. |
| `base64Path` | `"acceptance/resources"` | Independent base directory for BASE64 targets; resolve the exact file without a recursive search. |
| `poeditorSearchType` | `"exact"` | POE matching mode: `exact` or `contains`, both case-sensitive. |
| `poeditorKeyField` | `"reference"` | POEditor object field containing the identifier to match. |
| `poeditorPrefixes` | `[]` | Ordered prefixes tried before the unprefixed POE identifier. The first prefix with matches across all files wins. |
| `enableUsageNavigation` | `true` | Enable Go to Definition from resource keys/identifiers to their usages. Does not disable Find All References. |
| `referencePaths` | `["acceptance/common", "acceptance/features"]` | Recursively search `.py` and `.feature` files for literal LANG, CONF, POE and TOOLIUM usages. |

Configured directories are relative to the workspace folder containing the source
document. For usage searches, this is the folder containing the resource
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
| `"tooliumResources.baseConfigurationFiles": []` | Remove base-file classification; eligible `*-properties.json` environment files are still searched. |
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

- Configured base filenames and eligible `*-properties.json` environment files are searched.
- `*-private-properties.json`, `*-private.json`, `private-properties.json`, and
  `private.json` are excluded by default before their contents are opened,
  even if listed as base files. Customize `configurationExcludePatterns` to change this.
- If the key exists in multiple files, all destinations with the deepest resolved
  path are offered in a selector, with base files ordered first.
- Dynamic or missing segments stop at the last resolved parent, as for LANG.
- Only strict JSON is supported; invalid JSON is skipped.
- Arrays support integer indices: `[CONF:services.0.name]` selects the first service.
  Negative indices count from the end (`-1` is last), as in Toolium/Python.
  Invalid or out-of-range indices stop at the last resolved parent.
- Navigation does not select an active environment, merge configurations, or compute
  an effective value. If a key exists only in excluded files, no destination for
  that key is returned; a matching parent in an included file may still be offered.

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

## Initial scope

Files are discovered and parsed when navigation or completion is requested, without a persistent index. This keeps the implementation simple and up to date; caching can be added later for very large repositories. The extension does not interpret Examples, YAML aliases, or keys containing literal dots. LANG/CONF completion is included; resource values are not previewed in hovers.

## Find language resource usages

Cmd/Ctrl+click a mapping key in a configured language YAML file to navigate to
its literal LANG usages and those of its descendants. Right-click **Find All References** to list usages.
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
path as a segment prefix. Selecting `screen.alerts` finds both `[LANG:screen.alerts]`
and `[LANG:screen.alerts.missing]`, but not `[LANG:screen.alerts_extra]`.
Only closed, single-line placeholders are included; explicit `::language`
references are also recognized.
Dynamic references, aliases, sequence entries and keys containing literal dots
are not expanded. Multiple destinations follow VS Code's navigation settings.


## Direct resource navigation

In Python and feature files, hover over any closed supported placeholder and click
**Open resource**, or use **Toolium: Open Resource** from the Command Palette or
editor context menu. You can assign your own keyboard shortcut to
`tooliumResources.openResource` in Keyboard Shortcuts.

Recognized placeholders in the visible editor have a dotted underline. Use the
**Open resource** link in the hover to navigate.

The hover only recognizes the placeholder: it does not discover, open or parse
resource files. Resolution starts when the command runs. A single destination
opens immediately; multiple destinations appear in a file/line picker. LANG/CONF
retain their deepest-parent fallback for dynamic or missing segments.

Placeholder navigation no longer registers a Go to Definition provider, so
Cmd/Ctrl+click and F12 do not invoke Toolium from Python/feature placeholders.
The direct command does not consult other extensions' definition providers.
Other extensions can still provide their own navigation or affect editor performance.
Reverse navigation and Find All References from resource keys remain available.


### CONF, POE and TOOLIUM reverse searches

Find All References and reverse Go to Definition also support:

- **CONF:** select a property key in an included configuration JSON file to find exact
  and descendant CONF paths. Enclosing array indices are included; equivalent
  negative array indices are recognized. Values are not search entry points.
- **POE:** select the string identifier value of `poeditorKeyField` (default
  `reference`) in a POEditor JSON array. Matching uses the configured exact/contains
  mode and prefixes. Dots and colons remain literal; there is no branch search.
  Results identify potential uses matching this entry; runtime file/prefix precedence
  and translation filtering are not evaluated.
- **TOOLIUM:** select an option name in `toolium.cfg` or `local-toolium.cfg` to find
  its uses, or a section name to find uses of its explicit options. Colon encoding
  is recognized. Values, comments, continuation lines and inherited DEFAULT options
  are not search entry points.

Each resource must be inside its configured resource directories. CONF retains
its configured filename exclusions; TOOLIUM checks only the two filenames directly
inside `tooliumPaths`. JSON must be valid strict JSON. Searches use current unsaved
contents and the same `referencePaths`, workspace boundary, cancellation behavior
and `enableUsageNavigation` setting as LANG. Only closed, single-line placeholders
are included. FILE/FILE_UTF8/BASE64 reverse navigation is not provided.


### Configurable CONF exclusions

`configurationExcludePatterns` replaces the default exclusions. Globs are matched
case-insensitively against paths relative to the source workspace folder, including
hidden directories. A pattern without `/`, such as `*private-properties.json`,
matches filenames at any depth. A path pattern such as `acceptance/settings/archive/**`
only excludes that workspace-relative subtree. Patterns are exclusions, not regexes;
leading `!` does not re-include files.

```json
{
  "tooliumResources.configurationExcludePatterns": [
    "**/private.json", "**/private-properties.json",
    "**/*-private.json", "**/*-private-properties.json",
    "acceptance/settings/archive/**"
  ]
}
```

Use `[]` to attempt reading all eligible CONF files, including private filenames.
Eligibility still requires a configured base filename or a `*-properties.json`
filename under `configurationPaths`: disabling exclusions does not include arbitrary
JSON filenames. To include `private.json`, for example, also list it in
`baseConfigurationFiles`.

The extension attempts strict JSON parsing without detecting or decrypting encryption.
Valid JSON with encrypted string values remains navigable by key. Invalid JSON and
whole-file ciphertext are skipped. No resource content is sent to an external service.
The same exclusions apply to forward navigation, completion and reverse CONF searches.

## Development

See the [development guide](DEVELOPMENT.md) for local setup, tests, and releases.
