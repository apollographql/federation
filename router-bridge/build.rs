use deno_core::{JsRuntime, RuntimeOptions};
use std::error::Error;
use std::fs::{read_to_string, File};
use std::io::Write;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=js-src");
    update_bridge();
    create_snapshot().expect("unable to create v8 snapshot: query_runtime.snap");
}

fn update_bridge() {
    println!("cargo:warning=Updating router-bridge");
    let npm = which::which("npm").unwrap();
    let current_dir = std::env::current_dir().unwrap();
    let repo_dir = current_dir.parent().unwrap();

    assert!(Command::new(&npm)
        .current_dir(&repo_dir)
        .args(&["ci"])
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
    let runtime_str = read_to_string("js-dist/runtime.js")?;
    runtime
        .execute_script("<init>", &runtime_str)
        .expect("unable to initialize router bridge runtime environment");

    let polyfill_str = read_to_string("bundled/url_polyfill.js")?;
    runtime
        .execute_script("url_polyfill.js", &polyfill_str)
        .expect("unable to evaluate url_polyfill module");

    runtime
        .execute_script("<url_polyfill_assignment>", "whatwg_url_1 = url_polyfill;")
        .expect("unable to assign url_polyfill");

    // Load the composition library.
    let bridge_str = read_to_string("bundled/bridge.js")?;
    runtime
        .execute_script("bridge.js", &bridge_str)
        .expect("unable to evaluate bridge module");

    // Create our base query snapshot which will be included in
    // src/js.rs to initialise our JsRuntime().
    let mut snap = File::create("snapshots/query_runtime.snap")?;
    snap.write_all(&runtime.snapshot())?;

    Ok(())
}
