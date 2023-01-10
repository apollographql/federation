# Releasing Federation

This is a quick and opinionated set of commands for building and releasing a new version of the packages in this monorepo.

## Prerequisites

1. Install `gh` https://cli.github.com/ and ensure you're logged in with `gh auth status`

##

More details can be found in [the `changeset` docs for publishing](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md#versioning-and-publishing)

1. `FEDERATION_RELEASE_VERSION=X.Y.Z` (e.g. `2.0.1` or `2.0.0-beta.3` or `2.0.0-preview.99`)
1. `git fetch origin main` to fetch the latest `main` branch
1. `git checkout -b "release-$FEDERATION_RELEASE_VERSION" main`
1. You will need to have a GITHUB_TOKEN set up to use changesets. Create a token with your account with permissions `read:user` and `repo:status` and make sure it is assigned to the GITHUB_TOKEN environment variable
1. If alpha/beta/preview release:
   1. `npx changeset pre enter <alpha|beta|preview>`
   2. `npx changeset version` to bump versions, create changelog entries, etc.
   3. `npx changeset pre exit`
1. Otherwise this is a major/minor/patch release:
   1. `npx changeset version` to bump versions, create changelog entries, etc.
1. Review the changes to make sure they look correct. Note that there may be some log entries that may have been added without changesets that may need to be merged manually. Once everything looks good, commit the changes. 
1. `gh pr create --title "Release $FEDERATION_RELEASE_VERSION" --body-file ./.github/APOLLO_RELEASE_TEMPLATE.md`
~~1. Tag the commit to begin the publishing process[^publishing]
    - For alpha/beta/preview `APOLLO_DIST_TAG=next npm run release:start-ci-publish`
    - For release `APOLLO_DIST_TAG=latest npm run release:start-ci-publish`~~
~~1. `echo https://app.circleci.com/pipelines/github/apollographql/federation?filter=mine` and click the resulting link to approve publishing to NPM
    - There will also be a message posted to #team-atlas in slack that has a link to the approval job~~

Note: This will be on CircleCI eventually, but until we have it down and have seen it in action, we're going to do the npm publish locally rather than through Circle. Be careful with the next few steps as it will be modifying out published npm packages. Note that if this is an alpha release, we will now be publishing to the `alpha` tag instead of `next`. We should probably discuss whether or not to delete the `next` tag from npm.

1. `npx changeset publish`
2.  `git push --follow-tags`
3.  `unset FEDERATION_RELEASE_VERSION` to ensure we don't accidentally use this variable later
4.  Run `./scripts/check-npm-packages.sh` and ensure everything looks correct.

![celebrate](https://media.giphy.com/media/LZElUsjl1Bu6c/giphy.gif)

---

# More Context

## Troubleshooting

Mistakes happen. Most of these release steps are recoverable if you mess up.

_except_ don't make any mistakes yet, because we haven't documented troubleshooting steps.

[^publishing]: `npm run release:start-ci-publish` will create a `publish/timestamp-goes-here` looking tag, which starts a job in CircleCI to start the publishing process. There's a confirmation prompt in CircleCI that must be accepted before the package is fully published to NPM.
