use std::fs::metadata;
use std::process::Command;

fn main() {
    if !metadata("dist/composition.js").is_ok() {
        assert!(Command::new("npm")
            .current_dir("../")
            .args(&["run", "compile:for-harmonizer-build-rs"])
            .status()
            .unwrap()
            .success());
    }
}
