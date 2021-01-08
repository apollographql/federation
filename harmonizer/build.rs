use std::process::Command;

fn main() {
  println!("cargo:rerun-if-changed=package.json");
  println!("cargo:rerun-if-changed=js/index.mjs");

  let rollup = Command::new("npx")
    .current_dir("../")
    .args(&["lerna", "run", "--scope", "@apollo/harmonizer", "rollup"])
    .status()
    .unwrap();

  assert!(rollup.success());
}
