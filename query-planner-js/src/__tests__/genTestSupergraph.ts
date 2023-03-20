/*
 * Generates a test supergraph, used in `supergraphBackwardCompatiblity.test.ts`, for the version passed in argument.
 */

import { generateTestSupergraph } from "./supergraphBackwardCompatibility.test";


// This is called through ts-node so argv[0] is ts-node itself, argv[1] is this script file name, and argv[2] is thus our argument.
const version = process.argv[2];
if (!version) {
  console.error('Missing mandatory version argument.');
  process.exit(1);
}

// Ensure we're not given a completely broken argument. This also reject any `-alpha` or `-rc` versions on purpose: no
// point in keeping test supergraphs for those versions around.
if (!(/[0-9]+\.[0-9]+(\.[0-9]+)?/.test(version))) {
  console.error(`Invalid version number: must be of the form {major}.{minor}(.{patch})?, got "${version}"`);
  process.exit(1);
}

generateTestSupergraph(version);
