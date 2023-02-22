import { exec } from 'child_process';
import fetch from 'node-fetch';
import semver from 'semver';

const pkg = '@apollo/gateway';
const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
const json = await response.json();

const distTags = json['dist-tags'];
const sortedVersions = semver.sort(Object.keys(json.versions));
const mostRecentVersion = sortedVersions.pop();
const testVersion = distTags['test'];

console.log(`Found most recent version of ${pkg}: ${mostRecentVersion}`);
console.log(`Current \`test\` tag version of ${pkg}: ${testVersion}`);

if (testVersion !== mostRecentVersion) {
  console.log(`\`test\` tag is behind, updating...`);
  exec(`npm dist-tag add ${pkg}@${mostRecentVersion} test`, (e) => {
    console.error(e);
    console.error('Error occurred while updating `test` tag!');
    process.exit(1);
  });
} else {
  console.log('No action needed, `test` tag is pointed to most recent version');
  process.exit(0);
}
