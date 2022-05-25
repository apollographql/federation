# Releasing Federation

This is a quick and opinionated set of commands for building and releasing a new version of the packages in this monorepo.

#### Update changelogs

1. `FEDERATION_RELEASE_VERSION=X.Y.Z` (e.g. `2.0.1` or `2.0.0-beta.3` or `2.0.0-preview.99`)
1. `git fetch origin main` to fetch the latest `main` branch
1. `git checkout -b "release-$FEDERATION_RELEASE_VERSION" main`
1. `git log release-<the version of the last release>..` to see the changes since the last release
1. Update `CHANGELOG.md` in each repo ([more info](#changelogs)) and consolidate them into the root `CHANGELOG.md`
1. For actual releases (not alpha/beta/preview), consolidate any non-release CHANGELOG entries into a single version
1. `git add ':/*CHANGELOG.md'` to add changelogs to the commit

#### Bump version and tag release

1. `npx lerna version --no-push --force-publish=\* "$FEDERATION_RELEASE_VERSION"`[^lerna-version]
    - `git show --pretty="" --name-only HEAD` to see the files in the commit
    - `git --no-pager tag --points-at HEAD` to see the tags that were created
1. `git push --follow-tags -u origin "release-$FEDERATION_RELEASE_VERSION"` to push the version bumps & tags created by lerna in the previous step
1. `echo "https://github.com/apollographql/federation/compare/main...release-$FEDERATION_RELEASE_VERSION?quick_pull=1&title=Release+$FEDERATION_RELEASE_VERSION&template=APOLLO_RELEASE_TEMPLATE.md"` and click the resulting link to open PR in Github
    - If `gh` is installed (the command-line tool for github), create a PR thusly:
      ```
      gh pr create --title "Release $FEDERATION_RELEASE_VERSION" --body-file ./.github/APOLLO_RELEASE_TEMPLATE.md
      ``` 
1. Tag the commit to begin the publishing process[^publishing]
    - For alpha/beta/preview `APOLLO_DIST_TAG=next npm run release:start-ci-publish`
    - For release `APOLLO_DIST_TAG=latest npm run release:start-ci-publish`
1. `echo https://app.circleci.com/pipelines/github/apollographql/federation?filter=mine` and click the resulting link to approve publishing to NPM
    - There will also be a message posted to #team-atlas in slack that has a link to the approval job
1. `unset FEDERATION_RELEASE_VERSION` to ensure we don't accidentally use this variable later
1. `./scripts/check-npm-packages.sh` to spot-check the versions in NPM to ensure the packages were published correctly
1. For release (i.e. NOT an alpha/beta/preview), also add the `latest-2` dist tag
    - TODO: Make this easier/go away

#### Merge the release PR

1. Merge the release PR to `main`

![celebrate](https://media.giphy.com/media/LZElUsjl1Bu6c/giphy.gif)

---

# More Context

## Changelogs

Changelogs should be updated when creating a release. If there are no changes for a given package, no need to add a changelog entry.

1. [gateway-js/CHANGELOG.md](gateway-js/CHANGELOG.md)
1. [composition-js/CHANGELOG.md](composition-js/CHANGELOG.md)
1. [subgraph-js/CHANGELOG.md](subgraph-js/CHANGELOG.md)
1. [query-planner-js/CHANGELOG.md](query-planner-js/CHANGELOG.md)
1. [internals-js/CHANGELOG.md](internals-js/CHANGELOG.md)
1. [query-graphs-js/CHANGELOG.md](query-graphs-js/CHANGELOG.md)

## Why does `package-lock.json` get updated?

`npm version` is getting called due to [lerna version lifecycle hooks](https://github.com/lerna/lerna/tree/main/commands/version#lifecycle-scripts), which calls `npm i --package-lock-only` causing the package lock to get regenerated (this is a good thing).

## Troubleshooting

Mistakes happen. Most of these release steps are recoverable if you mess up.

_except_ don't make any mistakes yet, because we haven't documented troubleshooting steps.

[^lerna-version]: Learn more about the [`lerna version` command](https://github.com/lerna/lerna/tree/main/commands/version). For our purposes, the important parts are that `lerna` will update versions in the necessary `package*.json` files and create a tag for each package (e.g. `@apollo/federation-internals@2.0.0-preview.7`).
[^publishing]: `npm run release:start-ci-publish` will create a `publish/timestamp-goes-here` looking tag, which starts a job in CircleCI to start the publishing process. There's a confirmation prompt in CircleCI that must be accepted before the package is fully published to NPM.
