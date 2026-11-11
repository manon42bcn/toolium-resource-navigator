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

Update the version and lockfile in the release PR. For a patch release:

```sh
npm version patch --no-git-tag-version
```

Use `minor` or `major` when appropriate. Once the PR is merged and CI is green,
tag the release commit on `main`. For example, for version `1.0.1`:

```sh
git switch main
git pull --ff-only
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

After the tag workflow succeeds, download the VSIX from the corresponding
GitHub Release assets.

GitHub Release creation is documented in the
[GitHub CLI manual](https://cli.github.com/manual/gh_release_create).
This workflow distributes VSIX files through GitHub Releases.

## Publish to Visual Studio Marketplace

After pushing the release tag and reviewing the GitHub Release VSIX, open
**Actions → Publish to Visual Studio Marketplace → Run workflow**. Select
`main` as the workflow branch and enter the release tag, such as `v1.0.1`.
The workflow tests and packages the tagged source, then publishes that VSIX.

In the Marketplace publisher `manon42bcn`, the Trusted Publishing policy
uses GitHub owner `manon42bcn`, repository `toolium-resource-navigator`,
workflow `publish.yml`, and an empty environment. The publish job exchanges
its GitHub Actions OIDC token for a short-lived Marketplace credential.
See [VS Code's Trusted Publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing).
