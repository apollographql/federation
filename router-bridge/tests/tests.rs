use std::fs::File;
use std::io::Read;

#[test]
/// If this test fails, it means bundled/bridge.js` changed.
/// Make sure the change is intentional, and make sure you have committed the `router-bridge/bundled` directory
fn bundled_directory_is_up_to_date() {
    let (before_bridge, before_map, before_url_polyfill) = get_file_contents();

    let npm = which::which("npm").unwrap();
    let current_dir = std::env::current_dir().unwrap();

    let repo_dir = current_dir.parent().unwrap();
    assert!(std::process::Command::new(&npm)
        .current_dir(&repo_dir)
        .args(&["run", "compile:for-router-bridge-build-rs"])
        .status()
        .unwrap()
        .success());

    let (after_bridge, after_map, after_url_polyfill) = get_file_contents();

    assert_eq!(
        before_bridge, after_bridge,
        r#"bridge.js content error!
If this test fails, it means bundled/bridge.js` changed.
Make sure the change is intentional, and make sure you have committed the `router-bridge/bundled` directory.
"#
    );

    assert_eq!(
        before_map, after_map,
        r#"bridge.map.js content error!
If this test fails, it means bundled/bridge.map.js` changed.
Make sure the change is intentional, and make sure you have committed the `router-bridge/bundled` directory.
"#
    );

    assert_eq!(
        before_url_polyfill, after_url_polyfill,
        r#"url_polyfill.js content error!
If this test fails, it means bundled/url_polyfill.js` changed.
Make sure the change is intentional, and make sure you have committed the `router-bridge/bundled` directory.
"#
    );

    insta::assert_snapshot!(after_bridge);
    insta::assert_snapshot!(after_map);
    insta::assert_snapshot!(after_url_polyfill);
}

fn get_file_contents() -> (String, String, String) {
    let mut bridge_before_npm_compile = String::new();
    let mut bridge_map_before_npm_compile = String::new();
    let mut url_polyfill_before_npm_compile = String::new();

    let mut bridge_js = File::open("./bundled/bridge.js").unwrap();
    bridge_js
        .read_to_string(&mut bridge_before_npm_compile)
        .unwrap();
    let mut bridge_js_map = File::open("./bundled/bridge.js.map").unwrap();
    bridge_js_map
        .read_to_string(&mut bridge_map_before_npm_compile)
        .unwrap();
    let mut url_polyfill = File::open("./bundled/url_polyfill.js").unwrap();
    url_polyfill
        .read_to_string(&mut url_polyfill_before_npm_compile)
        .unwrap();

    (
        bridge_before_npm_compile,
        bridge_map_before_npm_compile,
        url_polyfill_before_npm_compile,
    )
}
