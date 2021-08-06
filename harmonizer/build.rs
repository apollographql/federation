use std::fs;
use std::process::Command;

fn main() {
    if fs::metadata("dist/bridge.js").is_err() {
        let npm = which::which("npm").unwrap();
        let current_dir = std::env::current_dir().unwrap();
        let repo_dir = current_dir.parent().unwrap();

        assert!(Command::new(&npm)
            .current_dir(&repo_dir)
            .args(&["install"])
            .status()
            .unwrap()
            .success());
        assert!(Command::new(&npm)
            .current_dir(&repo_dir)
            .args(&["run", "compile:for-harmonizer-build-rs"])
            .status()
            .unwrap()
            .success());
    }
}
