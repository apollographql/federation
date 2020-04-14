#!/usr/bin/env bash

#
# Dependencies: curl, cut
#
# The version to install and the binary location can be passed in via VERSION and DESTDIR respectively.
#

set -o errexit

echo "Starting installation..."

# GitHub's URL for the latest release, will redirect.
DESTDIR="${DESTDIR:-/usr/local/bin}"

echo "Installing Apollo CLI"

# Run the script in a temporary directory that we know is empty.
SCRATCH=$(mktemp -d || mktemp -d -t 'tmp')
cd "$SCRATCH"

function error {
  echo "An error occured installing the tool."
  echo "The contents of the directory $SCRATCH have been left in place to help to debug the issue."
}

trap error ERR

# Determine release filename. This can be expanded with CPU arch in the future.
if [ "$(uname)" == "Linux" ]; then
	OS="linux"
elif [ "$(uname)" == "Darwin" ]; then
	OS="darwin"
else
	echo "This operating system is not supported."
	exit 1
fi

RELEASE_URL="https://cli-proxy.apollographql.workers.dev/cli/${OS}/${VERSION}"

# Download & unpack the release tarball.
curl -sL --retry 3 "${RELEASE_URL}" | tar zx --strip 1

echo "Installing to $DESTDIR"
mv apollo "$DESTDIR"
chmod +x "$DESTDIR/apollo"

command -v apollo

# Delete the working directory when the install was successful.
rm -r "$SCRATCH"