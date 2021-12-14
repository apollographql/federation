use deno_core::{JsRuntime, RuntimeOptions};
use std::error::Error;
use std::fs::File;
use std::io::Write;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=js-src");
    update_bridge();
    if let Err(e) = create_snapshot() {
        panic!("failed to create snapshot: {}", e);
    }
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

fn create_snapshot() -> Result<(), Box<dyn Error>> {
    let options = RuntimeOptions {
        will_snapshot: true,
        ..Default::default()
    };
    let mut runtime = JsRuntime::new(options);
    // The runtime automatically contains a Deno.core object with several
    // functions for interacting with it.
    runtime
        .execute_script("<init>", include_str!("js-dist/runtime.js"))
        .expect("unable to initialize router bridge runtime environment");

    runtime
        .execute_script("url_polyfill.js", include_str!("bundled/url_polyfill.js"))
        .expect("unable to evaluate url_polyfill module");

    runtime
        .execute_script("<url_polyfill_assignment>", "whatwg_url_1 = url_polyfill;")
        .expect("unable to assign url_polyfill");

    // Load the composition library.
    runtime
        .execute_script("bridge.js", include_str!("bundled/bridge.js"))
        .expect("unable to evaluate bridge module");

    let mut snap = File::create("snapshots/query_runtime.snap")?;
    snap.write_all(&runtime.snapshot())?;

    Ok(())
}
