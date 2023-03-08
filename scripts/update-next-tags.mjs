// @ts-check
import { exec } from "child_process";
import { readFileSync } from "fs";
import fetch from "node-fetch";
import { resolve } from "path";
import semver from "semver";

// Collect all the packages that we publish
const workspaces = JSON.parse(
  readFileSync(resolve("package.json"), "utf-8")
).workspaces;
const publishedPackages = workspaces
  .map((workspace) => {
    const packageFile = JSON.parse(
      readFileSync(resolve(workspace, "package.json"), "utf-8")
    );
    if (packageFile.private === true) return null;
    return packageFile.name;
  })
  .filter(Boolean);

for (const pkg of publishedPackages) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(pkg)}`
  );
  const json = await response.json();
  const nextVersion = json["dist-tags"].next;
  const sortedVersions = semver.sort(Object.keys(json.versions));
  const mostRecentVersion = sortedVersions.pop();

  console.log(`Found most recent version of ${pkg}: ${mostRecentVersion}`);
  console.log(`Current \`next\` tag version of ${pkg}: ${nextVersion}`);

  if (nextVersion !== mostRecentVersion) {
    console.log(`\`next\` tag is behind, updating...`);
    exec(`npm dist-tag add ${pkg}@${mostRecentVersion} next`, (e) => {
      if (e) {
        console.error(e);
        console.error("Error occurred while updating `next` tag!");
      } else {
        console.log("`next` tag updated successfully!");
      }
    });
  } else {
    console.log(
      "No action needed, `next` tag is pointed to most recent version"
    );
  }
}
