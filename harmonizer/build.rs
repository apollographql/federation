use std::fs;
use std::process::Command;

fn main() {
  let ts_compile = Command::new("npm")
    .current_dir("../")
    .args(&["run", "compile"])
    .status()
    .expect("failed to run TypeScript compilation");

  assert!(ts_compile.success());

  let rollup = Command::new("npx")
    .current_dir("../")
    .args(&["lerna", "run", "--scope", "@apollo/harmonizer-js", "rollup"])
    .status()
    .unwrap();

  assert!(rollup.success());

  fs::copy(
    "../harmonizer-js/lib/composition.js",
    "./src/composition.js",
  )
  .unwrap();

  println!("cargo:rerun-if-changed=src/composition.js");
}
