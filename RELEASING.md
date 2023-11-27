# Releasing Federation

This is a quick and opinionated set of commands for building and releasing a new version of the packages in this monorepo.

## Prerequisites

1. Install `gh` https://cli.github.com/ and ensure you're logged in with `gh auth status`

##

More details can be found in [the `changeset` docs for publishing](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md#versioning-and-publishing)

1. Find the `changesets` release PR on the `main` (patch releases) or `next` (minor/major releases) branch.
    * If releasing from `next`, ensure that the branch is up to date with main 
2. Look at the PR and ensure that it looks good. If the version is not correct, you may need to create and merge a new PR that does one of the following:
    1. If the version is `alpha`/`beta`/`rc` and you prefer a new `major`/`minor`/`patch`, you'll need to run `npx changeset pre exit`. 
    2. If the version is not `alpha`/`beta`/`rc` and you want it to be, you'll need to run `npx changeset pre enter <alpha|beta|rc|preview>`. 
    3. If the version is a `patch` release, and you want it to be a `minor`, you'll need to make sure that you've committed a `npx changeset add` that has release notes for a minor release.
3. Once everything looks good, approve the PR and merge. This should create a new [GH release](https://github.com/apollographql/federation/releases) and publish the packages to NPM.
4. Verify whether NPM tags are correct (as occassionally we may need to manually fix them). Run `./scripts/check-npm-packages.sh` and ensure all tags look correct. If (when) they don't, you'll need to manually run `npm dist-tag` to ensure all tags are set to the correct release.
5. As part of publishing the release, two PRs will be created in `federation-rs`, one for the `harmonizer`, and the other for the `router-bridge`.
    1. If all tests pass and everything looks good, merge `harmonizer` PR first.
    2. Once the `harmonizer` release (Github action) is complete, merge the `router-bridge` PR.
7. When releasing minor/major versions, you will need to create a follow up PR to merge changes from `next` to `main` branch.
   * In order to preserve the change history between `next` and `main` branches, make sure to use `merge` commit. By default, all PRs should be `squashed` so you might need to temporarily re-enable `merge` commits in the repository settings.
   
![celebrate](https://media.giphy.com/media/LZElUsjl1Bu6c/giphy.gif)

---

# More Context

## Troubleshooting

Mistakes happen. Most of these release steps are recoverable if you mess up.

_except_ don't make any mistakes yet, because we haven't documented troubleshooting steps.

[^publishing]: `npm run release:start-ci-publish` will create a `publish/timestamp-goes-here` looking tag, which starts a job in CircleCI to start the publishing process. There's a confirmation prompt in CircleCI that must be accepted before the package is fully published to NPM.
