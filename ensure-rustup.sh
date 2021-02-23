#!/bin/bash

set -eu

if ! which rustup >/dev/null 2>&1; then
  if [ -n "${INSTALL_RUSTUP:-}" ]; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
      bash -s -- -y
    if [ -n "${WRITE_BASH_ENV:-}" ]; then
      # rustup's installer will write a source line to one of a few fixed
      # startup scripts, but to work properly on CircleCI you should write
      # it to $BASH_ENV instead, which CircleCI sets to a temp file.
      # shellcheck disable=SC2016
      echo 'source $HOME/.cargo/env' >> "$BASH_ENV"
    fi
  else
    echo 'rustup is not installed! Run "npm run rustup-install" to install it in your home' 1>&2
    echo 'directory. You may need to start a new shell afterwards for the PATH change to ' 1>&2
    echo 'take effect.' 1>&2
    echo 1>&2
    exit 1
  fi
fi
