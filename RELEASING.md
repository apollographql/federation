# Releasing Federation

This is a quick and opinionated set of commands for building and releasing a new version of the packages in this monorepo.

#### Start a release PR

1. `FEDERATION_RELEASE_VERSION=X.Y.Z` (e.g. `2.0.1` or `2.0.0-beta.3` or `2.0.0-preview.99`)
1. `git fetch origin main:main` to fetch the latest `main` branch
1. `git checkout -b "release-$FEDERATION_RELEASE_VERSION" main`
1. Update `CHANGELOG.md` in each repo ([more info](#changelogs))
1. `git add ':/*CHANGELOG.md'` to add only changelogs to the commit
1. `git commit --message "Update CHANGELOGs for v$FEDERATION_RELEASE_VERSION release"`
1. `git push -u origin "release-$FEDERATION_RELEASE_VERSION"`
1. `echo "https://github.com/apollographql/federation/compare/main...release-$FEDERATION_RELEASE_VERSION?quick_pull=1&title=Release+$FEDERATION_RELEASE_VERSION&template=APOLLO_RELEASE_TEMPLATE.md"` and click the resulting link to open PR in Github
    - If `gh` is installed (the command-line tool for github), create a PR thusly:
      ```
      gh pr create --title "Release $FEDERATION_RELEASE_VERSION" --body-file ./.github/APOLLO_RELEASE_TEMPLATE.md
      ``` 

#### Bump version and tag release

1. `npx lerna version --no-push --force-publish=\* "$FEDERATION_RELEASE_VERSION"`[^lerna-version]
    - `git show --pretty="" --name-only HEAD` to see the files in the commit
    - `git --no-pager tag --points-at HEAD` to see the tags that were created
1. `git push --follow-tags origin` to push the version bumps & tags created by lerna in the previous step
1. `APOLLO_DIST_TAG=next npm run release:start-ci-publish`[^publishing]
1. `echo https://app.circleci.com/pipelines/github/apollographql/federation?filter=mine` and click the resulting link to approve publishing to NPM
    - There will also be a message posted to #team-atlas in slack that has a link to the approval job
1. Spot-check a few of the versions in NPM to ensure the packages were published correctly
   - `npm view @apollo/composition@next`
   - `npm view @apollo/subgraph@next`
   - `npm view @apollo/gateway@next`
   - `npm view @apollo/query-planner@next`

#### Merge the release PR

1. Merge the release PR to `main`

![celebrate](https://media.giphy.com/media/LZElUsjl1Bu6c/giphy.gif)

---

# More Context

## Changelogs

Changelogs should be updated when creating a release. If there are no changes for a given package, add an entry that states `Released in sync with other federation packages but no changes to this package.`

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
