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
1. `open "https://github.com/apollographql/federation/compare/main...release-$FEDERATION_RELEASE_VERSION?title=Release+$FEDERATION_RELEASE_VERSION&template=APOLLO_RELEASE_TEMPLATE.md"` to open PR in Github

#### Bump version and tag release

1. `npx lerna version --no-push --force-publish=\* "$FEDERATION_RELEASE_VERSION"` ([more info](#lerna-version))
    1. TODO: remove `--no-push` when these instructions are ready. Or should we tell people to push as a next step?
1. `APOLLO_DIST_TAG=latest-2 npm run release:start-ci-publish` ([more info](#publishing))
    1. TODO: Can we change `latest-2` to `next` (that seems to be a bespoke standard)?
1. `open https://app.circleci.com/pipelines/github/apollographql/federation?filter=all` to approve
    1. TODO: Make it easier to get to the build job
1. `npm view @apollo/subgraph versions` to ensure the version that was just published shows up in the NPM registry

#### Merge the release PR

1. Merge the release PR to `main`

![celebrate](https://media.giphy.com/media/LZElUsjl1Bu6c/giphy.gif)

---

## Changelogs

Each changelog should be updated when creating a release. If there are no changes for a given package, add an entry that states `Released in sync with other federation packages but no changes to this package.`

1. [gateway-js/CHANGELOG.md](gateway-js/CHANGELOG.md) all changes should be reflected in here, since it's essentially a rollup of all packages
1. [composition-js/CHANGELOG.md](composition-js/CHANGELOG.md)
1. [subgraph-js/CHANGELOG.md](subgraph-js/CHANGELOG.md)
1. [query-planner-js/CHANGELOG.md](query-planner-js/CHANGELOG.md)
1. [internals-js/CHANGELOG.md](internals-js/CHANGELOG.md)
1. [query-graphs-js/CHANGELOG.md](query-graphs-js/CHANGELOG.md)

## `lerna version`

Important part is tagging with e.g.`@apollo/federation-internals@2.0.0-preview.7`, etc in each sub-repo

#### Why does `package-lock.json` get updated?

`npm version` is getting called due to [lerna version lifecycle hooks](https://github.com/lerna/lerna/tree/main/commands/version#lifecycle-scripts), which calls `npm i --package-lock-only` causing the package lock to get regenerated (this is a good thing)

## Publishing

The important part is creating a `publish/*` tag

## Troubleshooting

Mistakes happen. Most of these release steps are recoverable if you mess up.
