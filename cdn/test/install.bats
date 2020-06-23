#!./test/libs/bats/bin/bats
load '../node_modules/bats-support/load'
load '../node_modules/bats-assert/load'
load test_helper

profile_script="./public/install.sh"

setup() {
  export DESTDIR="$BATS_TMPDIR/test-bin_$RANDOM"
  export FORCE="1"
  if ! [ -d $DESTDIR ]; then
    mkdir "$DESTDIR"
  fi
}

@test ".should error if curl isn't installed on the machine" {
  source ${profile_script}
  clean_path="$(remove_commands_from_path curl)"
  PATH="$clean_path" run check_environment_readiness
  assert_failure
  assert_output -p "curl command is not installed"
}

@test ".should error if tar isn't installed on the machine" {
  source ${profile_script}
  clean_path="$(remove_commands_from_path tar)"
  PATH="$clean_path" run check_environment_readiness
  assert_failure
  assert_output -p "tar command is not installed"
}


@test ".check_environment_readiness should error if the DESTDIR isn't found" {
  source ${profile_script}
  export DESTDIR=$BATS_TMPDIR/not_found
  run check_environment_readiness
  assert_failure
  assert_output -p "Attempting to install the Apollo CLI in $BATS_TMPDIR/not_found but that directory wasn't found"
}

@test ".prepare_installation should remove existing command install" {
  stub ap true
  source ${profile_script}
  export FORCE="true"
  run prepare_installation
  assert_output -p "existing version of 'ap' is already installed at"
  if [ -n "$(command -v ap)" ]; then
    assert_failure
  else
    assert_success
  fi
}

@test '.download_and_install fails if not using linux or darwin arch' {
  source ${profile_script}
  function uname() { echo "Windows"; }
  export -f uname
  run detect_os
  assert_failure
  assert_output -p "This operating system ('$(uname)') is not supported."
}

@test '.download_and_install gets the correct url based on uname' {
    
  function uname() { echo "Darwin"; }
  export -f uname

  source ${profile_script}
  
  stub curl \
    "-sL --retry 3 https://install.apollographql.com/cli/darwin/ : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar.gz"
  
  BINDIR="$BATS_TMPDIR/writable_$RANDOM"
  mkdir "$BINDIR"
  cd "$BINDIR"
  PATH="$DESTDIR:$PATH"

  run download_and_install
  
  assert_success
  assert [ -x "${DESTDIR}/.apollo/bin/ap" ]
  unstub curl
}

@test ".run_main verifies the environment and installs the CLI" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  stub curl \
    "-sL --retry 3 https://install.apollographql.com/cli/linux/ : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar.gz"

  run run_main
  assert_success
  assert_output -p "Installed Apollo CLI in"
  unstub curl
}

@test ".run_main errors if the env isn't correct" {
  source ${profile_script}
  clean_path="$(remove_commands_from_path curl)"
  PATH="$clean_path" run run_main
  assert_failure
  assert_output -p "Environment checks failed!"
}

@test ".run_main errors if downloading fails" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  # intentionally missing .gz to fail install
  stub curl \
    "-sL --retry 3 https://install.apollographql.com/cli/linux/ : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar"  \
    "-sLI -o /dev/null -w %{url_effective} https://github.com/apollographql/rust/releases/latest/ : echo https://github.com/apollographql/rust/releases/tag/v0.0.1"  \
    "-sL --retry 3 https://github.com/apollographql/rust/releases/download/v0.0.1/ap-v0.0.1-x86_64-linux.tar.gz : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar.g"

  run run_main
  assert_failure
  assert_output -p "An error occured installing the tool. The contents of the directory"
}

@test ".run_main downloads from GitHub if the proxy fails" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  # intentionally missing .gz to fail install
  stub curl \
    "-sL --retry 3 https://install.apollographql.com/cli/linux/ : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar"  \
    "-sLI -o /dev/null -w %{url_effective} https://github.com/apollographql/rust/releases/latest/ : echo https://github.com/apollographql/rust/releases/tag/v0.0.1"  \
    "-sL --retry 3 https://github.com/apollographql/rust/releases/download/v0.0.1/ap-v0.0.1-linux.tar.gz : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar.gz"

  run run_main
  assert_success
  assert_output -p "Installed Apollo CLI in"
}

@test ".run_main downloads from GitHub if the proxy fails with a specific version passed" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  export VERSION="0.0.1"
  # intentionally missing .gz to fail install
  stub curl \
    "-sL --retry 3 https://install.apollographql.com/cli/linux/ : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar"  \
    "-sL --retry 3 https://github.com/apollographql/rust/releases/download/v0.0.1/ap-v0.0.1-linux.tar.gz : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar.gz"

  run run_main
  assert_success
  assert_output -p "Installed Apollo CLI in"
}

@test ".run_main errors if downloading from GitHub fails" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  # intentionally missing .gz to fail install
  stub curl \
    "-sL --retry 3 https://install.apollographql.com/cli/linux/ : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux.tar"  \
    "-sLI -o /dev/null -w %{url_effective} https://github.com/apollographql/rust/releases/latest/ : echo failure"

  run run_main
  assert_failure
  assert_output -p "An error occured installing the tool. The contents of the directory"
}

@test ".fallback_and_download_from_github error if cut isn't installed on the machine" {
  source ${profile_script}
  clean_path="$(remove_commands_from_path cut)"
  PATH="$clean_path" run fallback_and_download_from_github
  assert_failure
  assert_output -p "cut command is not installed"
}

@test ".run_main errors if tarball is missing executable" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  # intentionally missing .gz to fail install
  stub curl \
    "-sL --retry 3 https://install.apollographql.com/cli/linux/ : cat $FIXTURE_ROOT/ap-v0.0.1-x86_64-linux-bad.tar.gz"  \

  run run_main
  assert_failure
  assert_output -p "An error occured installing the tool. The contents of the directory"
}
