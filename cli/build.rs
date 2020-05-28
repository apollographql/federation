use std::fs::{read, write};
use std::path::PathBuf;
use uuid::Uuid;

use reqwest::blocking::Client;
use std::env;
use std::fs;

/// This script downloads the schema if it's not in the file system (in a path that's .gitignored)
/// If it exists, the script does nothing.
/// If UPDATE_SCHEMA environment variable is set, we download the schema if the etag is different on the
/// remote.
///
/// Example:
///
/// ```
/// UPDATE_SCHEMA=1 cargo build -vv
/// ```
///
/// The URL to fetch the schema can be overriden with the APOLLO_GPAPHQL_SCHEMA_URL environment variable.
///
/// Note: println! statements only show up with `-vv`
fn main() -> std::io::Result<()> {
    // Ensure this gets run every time. This is required, the default behavior is to only run
    // the build script if project files changed. In our case, we want it every time,
    // and most of the time it doesn't do anything.
    println!("cargo:rerun-if-changed=.schema/last_run.uuid");
    fs::create_dir_all(".schema").expect("failed creating the .schema directory");
    write(".schema/last_run.uuid", Uuid::new_v4().to_string()).expect("Failed writing uuid file");

    let schema_url = env::var("APOLLO_GPAPHQL_SCHEMA_URL")
        .unwrap_or_else(|_| "https://engine-graphql.apollographql.com/api/schema".to_owned());

    let schema_url_str = schema_url.as_str();

    let client = Client::new();
    let etag_path = PathBuf::from(".schema/etag.id");

    let should_update_schema = env::var("UPDATE_SCHEMA").is_ok();

    println!(
        "UPDATE_SCHEMA = {}",
        env::var("UPDATE_SCHEMA")
            .unwrap_or_else(|_| String::from("null"))
            .as_str()
    );

    if should_update_schema || !(etag_path.exists()) {
        if !(etag_path.exists()) {
            println!(".schema/etag.id doesn't exist");
            update_schema(&client, schema_url_str)
        } else {
            println!(".schema/etag.id exists");
            let curr_etag = String::from_utf8(read(etag_path).unwrap()).unwrap();
            println!("curr etag: {}", curr_etag);

            let response = client
                .head(schema_url_str)
                .send()
                .expect("Failed getting headers from Apollo's schema download url.");

            let remote_etag = response.headers().get("etag").and_then(|v| v.to_str().ok());
            println!("remote etag: {}", remote_etag.unwrap_or("None"));

            match remote_etag {
                Some(etag) if etag == curr_etag.as_str() => {
                    println!("etags match. Not updating schema.");
                    Ok(())
                }
                _ => update_schema(&client, schema_url_str),
            }
        }
    } else {
        Ok(())
    }
}

fn update_schema(client: &Client, url: &str) -> std::io::Result<()> {
    println!("updating schema.");
    let response = client
        .get(url)
        .send()
        .expect("Failed getting GraphQL schema from Apollo's schema download url.");

    let etag = response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .expect("Failed getting etag header from response.");

    println!("Saving {} to .schema/etag.id", etag);
    write(".schema/etag.id", etag)?;

    let schema = response
        .text()
        .expect("Failed getting schema text from response.");

    println!("Writing schema text to .schema/schema.graphql");

    write(".schema/schema.graphql", schema)?;

    Ok(())
}
