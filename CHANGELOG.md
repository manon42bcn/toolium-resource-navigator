# Changelog

## 1.0.3 (Unreleased)

## 1.0.2

- Fix the **Open resource** hover link on Windows and for paths containing spaces, `#`, or `%` ([#9](https://github.com/manon42bcn/toolium-resource-navigator/issues/9)).
- Add the optional `tooliumResources.enablePlaceholderDefinitionNavigation` setting to open resources from Python and Gherkin placeholders with Cmd/Ctrl+click or F12. Disabled by default.

## 1.0.1

- Keep installation, usage and configuration in the Marketplace README. Move contributor setup and release instructions to the development guide.

## 1.0.0

Initial public release of Toolium Resource Navigator.

- Open Toolium resources from Python and Gherkin using the hover link or the **Toolium: Open Resource** command.
- Identify recognized placeholders by their dotted underline.
- Navigate LANG, CONF, POE, TOOLIUM, FILE, FILE_UTF8 and BASE64 placeholders.
- Complete LANG and CONF keys and find usages from LANG, CONF, POE and TOOLIUM resources.
- Configure resource folders, reference search paths and CONF file exclusions per workspace.
