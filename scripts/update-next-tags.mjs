// @ts-check
import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync } from "fs";
import fetch from "node-fetch";
import { resolve } from "path";
import semver from "semver";

const asyncExec = promisify(exec);

let statusCode = 0;
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

await Promise.all(
  publishedPackages.map(async (pkg) => {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(pkg)}`
      );
      const json = await response.json();
      const nextVersion = json["dist-tags"].next;
      const sortedVersions = semver.sort(Object.keys(json.versions));
      const mostRecentVersion = sortedVersions.pop();

      console.log(`Found most recent version of ${pkg}: ${mostRecentVersion}`);
      console.log(`Current \`next\` tag version of ${pkg}: ${nextVersion}`);

      const command = `npm dist-tag add ${pkg}@${mostRecentVersion} next`;
      if (nextVersion !== mostRecentVersion) {
        console.log(`\`next\` tag is behind, updating...`);
        try {
          const { stdout, stderr } = await asyncExec(command)
          if (stderr) console.error(stderr);
          if (stdout) console.log(stdout);
        } catch (e) {
          console.error(e);
          throw e;
        }
      } else {
        console.log(
          "No action needed, `next` tag is pointed to most recent version"
        );
      }
    } catch (e) {
      console.error(`Error occurred while updating \`next\` tag for ${pkg}!`);
      console.error(e);
      statusCode = 1;
    }
  })
);

process.exit(statusCode);
