# How to release new test-versions of the WIP connectors features

Remove these instructions when this feature is ready to release

1. Merge `main` into `connectors`
2. `npx changeset` and fill out the details of the changes
3. `npx changeset version` to bump the version
4. Commit and push
5. Merge `connectors` into `version-connectors`
6. Push. This kicks off a new pre-release build on GitHub Actions

Now switch to `federation-rs`

1. Switch to `main` and pull the latest changes
2. Checkout `connectors` and merge main into it
3. `export HARMONIZER_RELEASE_VERSION=composition@v2.8.0-connectors.0` replacing the version with the one you just released
4. `npm i --prefix federation-2/harmonizer -E @apollo/$HARMONIZER_RELEASE_VERSION`
5. `cargo xtask dist --debug`
6. Commit and push the changes. Ensure CI passes.
7. `cargo xtask tag --package $HARMONIZER_RELEASE_VERSION --real-publish`
