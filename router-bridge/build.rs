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
