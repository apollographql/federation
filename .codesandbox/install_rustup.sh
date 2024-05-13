#!/usr/bin/env bash
set -euo pipefail

# Print out the architecture and Ubuntu version
dpkg --print-architecture

curl http://http.us.debian.org/debian/pool/main/b/build-essential/build-essential_12.10_amd64.deb -o /tmp/build-essential_12.10_amd64.deb
dpkg -i /tmp/build-essential_12.10_amd64.deb
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
