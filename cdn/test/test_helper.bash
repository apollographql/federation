# The real champions of this test suite are thanks to the `ruby-build` project and their
# fantastic setup work. Proudly copied from https://github.com/rbenv/ruby-build/blob/637ddf3e2404cb3170e25d3c5bd9dcac73d88ace/test/test_helper.bash

export TMP="$BATS_TEST_DIRNAME/tmp"
export BATS_RUNNING="true"

if [ "$FIXTURE_ROOT" != "$BATS_TEST_DIRNAME/fixtures" ]; then
  export FIXTURE_ROOT="$BATS_TEST_DIRNAME/fixtures"
  export INSTALL_ROOT="$TMP/install"
  PATH="/usr/bin:/bin:/usr/sbin:/sbin"
  PATH="$BATS_TEST_DIRNAME/../bin:$PATH"
  PATH="$TMP/bin:$PATH"
  export PATH
fi

remove_commands_from_path() {
  local path cmd
  local paths=( $(command -v "$@" | sed 's!/[^/]*$!!' | sort -u) )
  local NEWPATH=":$PATH:"
  for path in "${paths[@]}"; do
    local tmp_path="$(mktemp -d "$TMP/path.XXXXX")"
    ln -fs "$path"/* "$tmp_path/"
    for cmd; do rm -f "$tmp_path/$cmd"; done
    NEWPATH="${NEWPATH/:$path:/:$tmp_path:}"
  done
  echo "${NEWPATH#:}"
}

teardown() {
  cat "${TMP:?}"/curl-stub-plan
  rm -fr "${TMP:?}"/*
}

stub() {
  local program="$1"
  local prefix="$(echo "$program" | tr a-z- A-Z_)"
  shift

  export "${prefix}_STUB_PLAN"="${TMP}/${program}-stub-plan"
  export "${prefix}_STUB_RUN"="${TMP}/${program}-stub-run"
  export "${prefix}_STUB_END"=

  mkdir -p "${TMP}/bin"
  ln -sf "${BATS_TEST_DIRNAME}/stubs/stub" "${TMP}/bin/${program}"

  touch "${TMP}/${program}-stub-plan"
  for arg in "$@"; do printf "%s\n" "$arg" >> "${TMP}/${program}-stub-plan"; done
}

unstub() {
  local program="$1"
  local prefix="$(echo "$program" | tr a-z- A-Z_)"
  local path="${TMP}/bin/${program}"

  export "${prefix}_STUB_END"=1

  local STATUS=0
  "$path" || STATUS="$?"

  rm -f "$path"
  rm -f "${TMP}/${program}-stub-plan" "${TMP}/${program}-stub-run"
  return "$STATUS"
}