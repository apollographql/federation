#!/usr/bin/env node

const { spawnSync } = require('child_process');

// Try to run rustup with the "version" (-V) flag, to smoke test whether
// or not Rust is already installed.
const result =
  spawnSync(process.platform === "win32" ? "rustup.exe" : "rustup", ["-V"]);

// If this returns 0, then it is available!  No need for additional work.
// If it returns anything else (most likely `null`, since there's not much
// else that can go wrong with the "version" command), then it's likely that
// Rust isn't installed, or that the installation is otherwise broken.
if (result.status === 0) {
  process.exit(0);
}

console.info("***************************************************************");
console.info("*  Rustup needs to be installed to work with this repository  *");
console.info("***************************************************************");
console.info("");
console.info("For information how to install it, visit:")
console.info("");
console.info("  => https://rustup.rs/");
console.info("");
process.exit(1);
