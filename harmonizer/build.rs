use std::path::Path;
use std::process::Command;
use std::{env, fs::metadata};

fn main() {
    let out_dir = env::var_os("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("/dist/composition.js");
    if metadata(dest_path).is_err() {
        assert!(Command::new("npm")
            .current_dir("../")
            .args(&["run", "compile:for-harmonizer-build-rs"])
            .env("APOLLO_HARMONIZER_ROLLUP_BASE_DIR", out_dir)
            .status()
            .unwrap()
            .success());
    }
}
