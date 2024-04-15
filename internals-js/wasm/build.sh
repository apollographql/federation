#!/usr/bin/env bash
set -euo pipefail

# Using a BASH script instead of build.rs because wasm-pack deadlocks when run
# from a build.rs script: https://github.com/rustwasm/wasm-pack/issues/916

cd $(dirname "$0")

rm -rf node
wasm-pack build --release --target nodejs --out-dir node

# If we neglect to remove this file, nothing within the wasm/node directory will
# be published to npm, because the default .gitignore ignores everything.
rm node/.gitignore
