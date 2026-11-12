# Toolium Resource Navigator development

## Local setup

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

Open this folder in VS Code and press F5. In the Extension Development Host window, open the project containing your features and resources. Try hovering over a LANG reference and clicking **Open resource**.

## Build and install a local VSIX

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
`main` or `dev`, pushes to `main`, version-tag pushes (`v*`), and manual runs from Actions.
It selects Node.js from `.nvmrc`, installs dependencies with `npm ci`, runs the
tests, packages the extension, and saves a `vsix` artifact for 14 days.
Download it from **Actions → workflow run → Artifacts → vsix** and extract the
VSIX before installing it.

Pushing a version tag also creates a GitHub Release after the build succeeds,
attaching the same VSIX produced by that build. The tag must equal `v` followed
by the version in both `package.json` and `package-lock.json`. Release assets
remain available independently of the Actions artifact's retention period.
The workflow uses GitHub's built-in token; no Marketplace token is needed.

### Automatic releases from dev to main

For the initial setup, merge the automation through `dev` into `main` with
the current stable version. The workflow skips a stable version already
tagged in the merged history. Then run **Build and release** from `main` with
**Open the next development version on dev from the current release** checked.
This merges the current stable `main` into `dev` and opens `1.0.3-dev.0` there.

Merging a PR from this repository's `dev` into `main` closes the development
version in the manifest, lockfile, and changelog. The workflow tests and
packages the stable commit, pushes it to `main` with its version tag, and
creates the GitHub Release with the VSIX and changelog notes. It then merges
the tagged commit into `dev` and opens the next patch version as `-dev.0`
with an Unreleased changelog section.

Add release notes to the Unreleased section in `dev`. To release a minor
or major version, set the desired development version in the manifest and
lockfile on `dev`, for example `npm version 1.1.0-dev.0 --no-git-tag-version`.
Use a merge commit for the release PR so both branches retain their shared
history.

The branch and tag rules must allow the workflow token to write `main` and
`dev` and create version tags. Wait for the release to finish before merging
another PR to `main`. Rerun a failed workflow to finish a tagged release.
If syncing the stable tag into `dev` produces conflicts, merge the tag into
`dev` and resolve them, keeping the stable changelog entry and any subsequent
development changes, then rerun the workflow.

## Publish to Visual Studio Marketplace

After reviewing the GitHub Release VSIX, open
**Actions → Publish to Visual Studio Marketplace → Run workflow**. Select
`main` as the workflow branch and enter the release tag, such as `v1.0.1`.
The workflow tests and packages the tagged source, then publishes that VSIX.

In the Marketplace publisher `manon42bcn`, the Trusted Publishing policy
uses GitHub owner `manon42bcn`, repository `toolium-resource-navigator`,
workflow `publish.yml`, and an empty environment. The publish job exchanges
its GitHub Actions OIDC token for a short-lived Marketplace credential.
See [VS Code's Trusted Publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing).
