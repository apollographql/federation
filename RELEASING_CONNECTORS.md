# How to release new test-versions of the WIP connectors features

Remove these instructions when this feature is ready to release

1. Merge `main` into `connectors`
2. Merge `connectors` into `version-connectors`
3. `npx changeset` and fill out the details of the changes
4. `npx changeset version` to bump the version
5. Commit and push. This kicks off a new pre-release build on GitHub Actions
6. Merge `version-connectors` into `connectors` to get the new version into the development branch
