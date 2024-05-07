#!/usr/bin/env bash
set -euo pipefail

# Using a BASH script instead of build.rs because wasm-pack deadlocks when run
# from a build.rs script: https://github.com/rustwasm/wasm-pack/issues/916

cd $(dirname "$0")

wasm-pack build --release --target nodejs --out-dir node
