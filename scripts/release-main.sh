#!/usr/bin/env bash
set -euo pipefail

git fetch origin main dev --tags
git switch --detach origin/main
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

read_version() {
  node -p 'require("./package.json").version'
}

version=$(read_version)
if [[ ! $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-dev\.[0-9]+)?$ ]]; then
  echo "Unsupported release version: $version" >&2
  exit 1
fi
stable="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
next="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))"
tag="v$stable"
sync_commit="$tag"

package_release() {
  npm ci
  npm test
  npm run package
}

if [[ ${1:-} == bootstrap ]]; then
  [[ $version == "$stable" ]]
  git merge-base --is-ancestor "$tag^{commit}" HEAD
  sync_commit=$(git rev-parse HEAD)
else
  if [[ $version != "$stable" ]]; then
    if [[ $(git rev-parse HEAD) != "$GITHUB_SHA" ]]; then
      echo "main advanced before this release could be prepared." >&2
      exit 1
    fi
    node scripts/release-changelog.cjs close "$stable"
    npm version "$stable" --no-git-tag-version --ignore-scripts
    git add package.json package-lock.json CHANGELOG.md
    git commit -m "Automated release $tag"

    package_release
    git tag "$tag"
    git push --atomic origin HEAD:refs/heads/main "refs/tags/$tag"
  elif [[ $(git rev-parse "$tag^{commit}^") != "$GITHUB_SHA" ]]; then
    git merge-base --is-ancestor "$tag^{commit}" "$GITHUB_SHA"
    echo "$tag already covers the stable version. Open a development version on dev to start the next release."
    exit 0
  fi

  release_exists=false
  if gh release view "$tag" --json assets --jq '.assets[].name' > "${RUNNER_TEMP}/release-assets"; then
    release_exists=true
  fi
  if ! grep -q '\.vsix$' "${RUNNER_TEMP}/release-assets"; then
    git switch --detach "$tag"
    if [[ $version == "$stable" ]]; then
      package_release
    fi
    if [[ $release_exists == true ]]; then
      gh release upload "$tag" dist/*.vsix
    else
      node scripts/release-changelog.cjs notes "$stable" > "${RUNNER_TEMP}/release-notes.md"
      gh release create "$tag" dist/*.vsix --verify-tag --title "$tag" --notes-file "${RUNNER_TEMP}/release-notes.md"
    fi
  fi
fi

git fetch origin dev
git switch --detach origin/dev
if git merge-base --is-ancestor "$sync_commit^{commit}" HEAD && [[ $(read_version) != "$version" ]]; then
  echo "dev already contains the release and has advanced."
  exit 0
fi

# Merge the stable commit into dev before opening the next development cycle.
git merge --no-ff --no-commit "$sync_commit"
node scripts/release-changelog.cjs open "$next"
npm version "$next-dev.0" --no-git-tag-version --ignore-scripts
git add package.json package-lock.json CHANGELOG.md
git commit -m "Start $next-dev.0"
git push origin HEAD:refs/heads/dev
