use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=js-src");
    update_bridge();
}

fn update_bridge() {
    println!("cargo:warning=Updating router-bridge");
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
        .args(&["run", "compile:for-router-bridge-build-rs"])
        .status()
        .unwrap()
        .success());
}

fn recurse_rerun_if_changed(dir: impl AsRef<Path>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        let metadata = fs::metadata(&path)?;
        if metadata.is_dir() {
            recurse_rerun_if_changed(path)?;
        } else {
            println!("cargo:rerun-if-changed={:?}", path);
        }
    }

    Ok(())
}
