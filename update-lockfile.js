/**
 * This file exists as a solution to Lerna's lockfile v2 updating problem
 * See: https://github.com/lerna/lerna/issues/2832
 * 
 * Separately, this also updates the Cargo.toml and Cargo.lock files for
 * the `harmonizer` package.
 * 
 * This script is intended to be run automatically and on a per-package
 * basis as part of the Lerna `version` lifecycle hook. Note its
 * references in the `version` script of each package's package.json file.
*/
// @ts-check
const { writeFileSync, readFileSync } = require('fs');
const { basename, resolve } = require('path');

const cwd = process.cwd();
const packageFile = require(resolve(cwd, 'package.json'));
const packageFolderName = basename(cwd);
const { version } = packageFile; 

const lockFilePath = resolve(__dirname, 'package-lock.json')
const lockFileContents = require(resolve(__dirname, 'package-lock.json'));

lockFileContents.packages[packageFolderName].version = version;
writeFileSync(lockFilePath, JSON.stringify(lockFileContents, null, 2));

// Update Cargo.toml and Cargo.lock if needed.
if (packageFolderName === "harmonizer") {
  const TOML = require('@iarna/toml');

  // Parse and update Cargo.toml with the new version #.
  const cargoFilePath = resolve(cwd, 'Cargo.toml');
  const cargoFileContents = TOML.parse(readFileSync(cargoFilePath, 'utf8'));
  cargoFileContents.package["version"] = version;
  writeFileSync(cargoFilePath, TOML.stringify(cargoFileContents));

  // Calling `cargo build` auto-updates the root Cargo.lock file.
  require('child_process').spawnSync('cargo', ['build']);
}