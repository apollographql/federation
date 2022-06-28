# Releasing Federation

This is a quick and opinionated set of commands for building and releasing a new version of the packages in this monorepo.

## Prerequisites

1. Install `gh` https://cli.github.com/ and ensure you're logged in with `gh auth status`

##

More details can be found in [the `changeset` docs for publishing](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md#versioning-and-publishing)

1. `FEDERATION_RELEASE_VERSION=X.Y.Z` (e.g. `2.0.1` or `2.0.0-beta.3` or `2.0.0-preview.99`)
1. `git fetch origin main` to fetch the latest `main` branch
1. `git checkout -b "release-$FEDERATION_RELEASE_VERSION" main`

1. `npx changeset version` to bump versions, create changelog entries, etc.
1. Review the changes to make sure they look correct. If so, add and commit them.
1. `gh pr create --title "Release $FEDERATION_RELEASE_VERSION" --body-file ./.github/APOLLO_RELEASE_TEMPLATE.md`
1. TODO: `npx changeset pre enter next` if alpha/beta/preview
1. `npx changeset publish`
1. TODO: `npx changeset pre exit next` if alpha/beta/preview


## Merge the release PR

1. Merge the release PR to `main`
1. `unset FEDERATION_RELEASE_VERSION` to ensure we don't accidentally use this variable later

![celebrate](https://media.giphy.com/media/LZElUsjl1Bu6c/giphy.gif)

---

# More Context

## Troubleshooting

Mistakes happen. Most of these release steps are recoverable if you mess up.

_except_ don't make any mistakes yet, because we haven't documented troubleshooting steps.

[^publishing]: `npm run release:start-ci-publish` will create a `publish/timestamp-goes-here` looking tag, which starts a job in CircleCI to start the publishing process. There's a confirmation prompt in CircleCI that must be accepted before the package is fully published to NPM.
