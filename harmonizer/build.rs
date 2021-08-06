use std::fs;
use std::process::Command;

fn main() {
    if fs::metadata("dist/bridge.js").is_err() {
        let npm = which::which("npm").unwrap();
        assert!(Command::new(&npm)
            .current_dir(fs::canonicalize("../").unwrap())
            .args(&["install"])
            .status()
            .unwrap()
            .success());
        assert!(Command::new(&npm)
            .current_dir(fs::canonicalize("../").unwrap())
            .args(&["run", "compile:for-harmonizer-build-rs"])
            .status()
            .unwrap()
            .success());
    }
}
