# Development

This document is __a work-in-progress__ which aims to describe various tips for __developing and working with this repository itself__.  It is not intended as a guide on how to use the project within another project, which should be covered elsewhere in the project's documentation.

Currently, it's mostly in-depth info about creating, publishing, and finishing a release. A more succinct document for creating a release can be found in [RELEASING.md](./RELEASING.md).

## Staging a release as a PR

Depending on the size of the release, it may be ideal to have a staging PR which gathers the various features we're intending on releasing into the version.  This can be a great way for the community to understand the scope of a release and a clear way for maintainers to publicize it and gather feedback.

> Note: The instructions here cater to a world where the packages in a repository are published in lock-step, as is the case with all of the `apollo-server-*` packages in the Apollo Server repository.  Release branches are still a good idea, but in this repository it quite possible that there are multiple versions involved (e.g., a version of `@apollo/subgraph` and a version of `@apollo/gateway`).  In that regard, it's expected that the branch names and the PR title will deviate from the suggestion below.  The branch should still be prefixed with `release-` (for _Branch protection rules_ to match easily), but the rest of the branch name might be different, e.g., `release-federation-X.Y.Z`.

1. Create a branch off `main` named `release-X.Y.Z`, where `X.Y.Z` is the intended release.
2. Edit the appropriate `CHANGELOG.md` (in the appropriate package directory; e.g. `./gateway-js/CHANGELOG.md`), removing the `vNEXT` section entirely.  This section will remain on `main` and be resolved during the merge.
3. Add a new section for `### vX.Y.Z` with a bullet indicating that something is coming soon:

   ```
   ### vX.Y.Z

   - Nothing yet! Stay tuned.
   ```

4. Commit this change so GitHub will allow a PR to be opened against `main` with a notable change.  A suggested commit message is `Prepare CHANGELOG.md for upcoming vX.Y.Z release.`
5. Push the branch to GitHub
6. On GitHub, open a PR from the new release branch which targets `main`.
   __For the title of the PR__, use "Release X.Y.Z" (See the "Note" above about how this might vary on this repository).  __For the body,__ use the contents of the template in the `.github/APOLLO_RELEASE_TEMPLATE.md` file in this repository.  Adjust the body as you see necessary.

## Publishing a release

### Step 1: Update the appropriate CHANGELOG.md files

There is not a root `CHANGELOG.md` on this monorepo.  Instead, there are `CHANGELOG.md` files for specific packages:
 
- `./query-planner-js/CHANGELOG.md` for `@apollo/query-planner`
- `./subgraph-js/CHANGELOG.md` for `@apollo/subgraph`

  > Since this is not a direct dependency of our _primary_ consumers, it is best to *also* surface important changes in `@apollo/gateway`'s `CHANGELOG.md`.
- `./gateway-js/CHANGELOG.md` for `@apollo/gateway`.

Ensure that the appropriate CHANGELOG.md (using the guide above) within affected packages are up to date prior to bumping the version.  Additionally, it's best to go ahead and predict what the version is going to be published as in the next step and commit that in the CHANGELOG.  This allows the Git tags that will be created in Step 2 to include the changes.

_Optional:_ To determine which packages are "changed" on the current branch (compared to the last published versions on the same branch; Lerna follows the `git tag`s on the branch to determine this, run the following from the project root:

```
npx lerna changed
```

This will list the packages that will have their versions bumped in the next step.

### Step 2: Bump the version

To bump the version, use the `lerna version` command.

   __Option 1__: Bump all packages by the same version bump (e.g. `patch`, `minor`, `prerelease`, etc.).

   > __Note__: Be sure to replace `<version-bump>` in the following command with the appropriate [version bump keyword](https://github.com/lerna/lerna/tree/f6e7a13e60/commands/version#semver-bump)

   ```
   npx lerna version <version-bump>
   ```

   __Option 2__: Be interactively prompted for each new version.

   This option works reasonably well in this federation repositiory since there are not all that many packages.  If no parameters are passed, a prompt will be displayed for each package asking for the new version.

   ```
   npx lerna version
   ```


### Step 3: Publish with CI/CD

Immediately after bumping the version, use the `release:start-ci-publish` npm script to publish to npm.

> __Note: By default, publishing will be done to the `latest` tag on npm.__  To publish on a different `dist-tag` set the `APOLLO_DIST_TAG` environment variable.  E.g. To publish to the `alpha` tag instead of `latest`, the following command would be `APOLLO_DIST_TAG=alpha npm run release:start-ci-publish`.

```
APOLLO_DIST_TAG=latest npm run release:start-ci-publish
```

#### Step 3b: Manually publishing

__In the event that publishing via CI/CD is not possible, it may be done manually. Publishing manually should be avoided whenever possible.__

1. Log into `npm` with the `apollo-bot` user.

The `apollo-bot` user credentials are available to project owners, but generally used by CI/CD.
Logging in with the following command will use a different npm user configuration file at `$HOME/.npmrc-apollo-bot` so as not to override personal login credentials which may already be used.

```
NPM_CONFIG_USERCONFIG="$HOME/.npmrc-apollo-bot" npm login
```

2. Publish using `lerna` and the `apollo-bot` credentials.


> Note: By default, publishing will be done to the `latest` tag on npm.  To publish on a different `dist-tag` include the `--dist-tag` option below.  E.g. To publish to the `alpha` tag instead of `latest`, add `--dist-tag=alpha`.

```
DEBUG=lerna NPM_CONFIG_USERCONFIG="$HOME/.npmrc-apollo-bot" npx lerna publish from-git
```

### Step 4: Update GitHub Milestones

The [milestones](./milestones) should be updated, as appropriate. If the milestone didn't didn't have a concrete version as its name, it should be renamed to the version that was finally released.

Then, any remaining issues or PRs which did not land in this version should be moved to a newly-created milestone which reflects the newly intended release for them.

Finally, _close_ (don't delete) the previous milestone once it is at 100% completion.
