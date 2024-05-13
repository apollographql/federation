# How to release new test-versions of the WIP connectors features

Remove these instructions when this feature is ready to release

1. Merge `main` into `connectors`
2. Merge `connectors` into `version-connectors`
3. `npx changeset` and fill out the details of the changes
4. `npx changeset version` to bump the version
5. Commit and push. This kicks off a new pre-release build on GitHub Actions
6. Merge `version-connectors` into `connectors` to get the new version into the development branch

Now switch to `federation-rs`

1. Switch to `main` and pull the latest changes
2. Checkout `connectors` and merge main into it
3. `export HARMONIZER_RELEASE_VERSION=composition@v2.8.0-connectors.0` replacing the version with the one you just released
4. `cd federation-2/harmonizer`
5. `npm i -E @apollo/$HARMONIZER_RELEASE_VERSION`
6. `cd -` (get back to the root of the repo)
7. `cargo xtask dist --debug`
8. Commit and push the changes
9. `cargo xtask tag --package $HARMONIZER_RELEASE_VERSION --real-publish`
