use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

fn main() {
    let target_dir = std::env::var_os("OUT_DIR").unwrap();
    // Always rerun the script
    println!("cargo:rerun-if-changed={:?}", target_dir);

    let bridge_last_update = if let Ok(b) = fs::metadata("bundled/bridge.js") {
        b.modified()
    } else {
        // No bridge.js, let's create it
        return update_bridge();
    };

    let mut js_dist_last_update = None;

    if sub_last_modified_date(&mut js_dist_last_update, "./js-dist").is_err()
        || js_dist_last_update.is_none()
    {
        // Os doesn't allow querying the metadata, this is weird. let's update the bridge.
        return update_bridge();
    };

    match (&bridge_last_update, &js_dist_last_update) {
        // the federation folder has evolved since the last time we built harmonizer.
        (Ok(bridge), Some(federation)) if federation > bridge => update_bridge(),
        // Os didn't allow to query for metadata, we can't know for sure the bridge is up to date.
        (Err(_), _) => update_bridge(),
        _ => {
            println!("cargo:warning=router-bridge is already up to date!");
        }
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

fn sub_last_modified_date(
    mut latest_metadata: &mut Option<SystemTime>,
    dir: impl AsRef<Path>,
) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        let metadata = fs::metadata(&path)?;
        let last_modified = metadata.modified()?;

        if latest_metadata.is_none()
            || latest_metadata.is_some() && latest_metadata.unwrap() < last_modified
        {
            *latest_metadata = Some(last_modified);
        }

        if metadata.is_dir() {
            sub_last_modified_date(&mut latest_metadata, path)?;
        }
    }

    Ok(())
}
