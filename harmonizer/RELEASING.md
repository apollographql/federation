# Releasing

## Automated steps

* Not currently automated! Please see https://github.com/apollographql/federation/issues/602.

## Manual Steps

### One time token creation
1. Login to crates.io with the credentials for `apollo-bot2`.
2. Go to https://crates.io/me
3. Under _API Access_ press _New Token_
4. Enter a name for the token that is specific enough that it's clear who owns it and where the token is.
   _(e.g., "CircleCI workflow, apollographql/federation repository", or "Your name's MacBook")_
5. Press _Create_.
6. Using the token that is created, run `cargo login "<token>"` in the terminal where the publish will happen.

### Each time
1. `npm run clean`
2. `npm install`
3. `npm test`
4. **Do not proceed if `npm test` tests failed!**
5. Bump `version` property in `harmonizer/Cargo.toml`, as appropriate.
6. `cd harmonizer`
7. `cargo test`
8. **Do not proceed if `cargo test` tests failed!**
9. _(Optional, but I like it)_: `cargo package --list --allow-dirty`
   This command shows precisely which files are going to be included in this package.  While it does incur the cost of a build, you'll be mostly cached for subsequent steps.

   The reason this command is useful is that we're including JavaScript-built sources in this crate.  (See the [`README.md`](./README.md) for details.)  Therefore, it's critical that `dist/composition.js` and `js/do_compose.js` are included, in addition to `src/**/.rs` and `Cargo.toml` to ensure the package doesn't try to re-compile those sources in the consuming environment (which it will attempt to do with Node.js tooling which we don't want to push the burden of having onto the Rust consumers).

   **The `--allow-dirty` flag is required because** Cargo: will not `include` files that are `.gitignore`'d **and** Cargo refuses to publish packages that have untracked files in the working tree.  Since `dist/composition.js` is a larger, `rollup`'d bundle of the entire `@apollo/composition` package that is generated during a build (e.g., in CI, eventually), we don't check it into Git.  There might be another way to manage the inclusion/exception rules here, or we could just check the file into Git in a CI action, but that would seem to create a lot of unnecessary churn on the repository.
10. Next, also optional, but should be already built if you ran the previous step: `cargo publish --dry-run --allow-dirty`
11. Finally, `cargo publish --allow-dirty`.
