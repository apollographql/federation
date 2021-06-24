use std::fs;
use std::process::Command;

fn main() {
    if fs::metadata("node_modules").is_err() {
        assert!(Command::new("npm")
            .current_dir("../")
            .arg("install")
            .status()
            .expect("Could not execute `npm install`, is npm installed?")
            .success())
    }

    if fs::metadata("dist/composition.js").is_err() {
        assert!(Command::new("npm")
            .current_dir("../")
            .args(&["run", "compile:for-harmonizer-build-rs"])
            .status()
            .expect("Could not compile harmonizer.")
            .success());
    }
}
