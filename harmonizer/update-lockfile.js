/**
 * This updates the Cargo.toml and Cargo.lock files for
 * the `harmonizer` package.
*/
// @ts-check
const { writeFileSync, readFileSync } = require('fs');
const { resolve } = require('path');

const cwd = process.cwd();
const packageFile = require(resolve(cwd, 'package.json'));
const { version } = packageFile;

// Update Cargo.toml and Cargo.lock if needed.
const TOML = require('@iarna/toml');

// Parse and update Cargo.toml with the new version #.
const cargoFilePath = resolve(cwd, 'Cargo.toml');
const cargoFileContents = TOML.parse(readFileSync(cargoFilePath, 'utf8'));
cargoFileContents.package["version"] = version;
writeFileSync(cargoFilePath, TOML.stringify(cargoFileContents));

// Calling `cargo build` auto-updates the root Cargo.lock file.
require('child_process').spawnSync('cargo', ['build'], { stdio: 'inherit' });
process.exit(0);