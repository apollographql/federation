use std::process::Command;
use std::fs::metadata;

fn main() {
  if !metadata("dist/composition.js").is_ok() {
    assert!(Command::new("npm")
      .current_dir("../")
      .args(&["run", "compile"])
      .status()
      .unwrap()
      .success());
  }
}
