#!./test/libs/bats/bin/bats

load '../node_modules/bats-assert/load'
load test_helper

profile_script="./public/cli/install.sh"

setup() {
  export DESTDIR="$BATS_TMPDIR/test-bin_$RANDOM"
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

@test ".check_environment_readiness should error if the DESTDIR isn't writable" {
  source ${profile_script}
  DESTDIR="$BATS_TMPDIR/not_writable_$RANDOM"
  mkdir -m400 "$DESTDIR"
  run check_environment_readiness
  assert_failure
  assert_output -p "Attempting to install the Apollo CLI in $DESTDIR but the permissions deny writing to that directory."
}

@test ".check_environment_readiness should error if there is already an `apollo` command installed" {
  stub apollo true
  source ${profile_script}
  
  run check_environment_readiness
  assert_failure
  assert_output -p "An existing version of 'apollo' is already installed at "
}

@test '.download_and_install fails if not using linux or darwin arch' {
  source ${profile_script}
  function uname() { echo "Windows"; }
  export -f uname
  run download_and_install
  assert_failure
  assert_output -p "This operating system ('$(uname)') is not supported."
}

@test '.download_and_install gets the correct url based on uname' {
  source ${profile_script}
  
  stub curl \
    "-sL --retry 3 https://install.apollographql.workers.dev/cli/darwin/ : cat $FIXTURE_ROOT/apollo-v0.0.1-x86_64-linux.tar.gz"
  
  BINDIR="$BATS_TMPDIR/writable_$RANDOM"
  mkdir "$BINDIR"
  cd "$BINDIR"
  PATH="$DESTDIR:$PATH"
  function uname() { echo "Darwin"; }
  export -f uname

  run download_and_install
  
  assert_success
  assert [ -x "${DESTDIR}/apollo" ]
  unstub curl
}

@test ".run_main verifies the environment and installs the CLI" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  stub curl \
    "-sL --retry 3 https://install.apollographql.workers.dev/cli/linux/ : cat $FIXTURE_ROOT/apollo-v0.0.1-x86_64-linux.tar.gz"

  run run_main
  assert_success
  assert_output -p "Apollo CLI was successfully installed!"
}

@test ".run_main errors if the env isn't correct" {
  source ${profile_script}
  clean_path="$(remove_commands_from_path curl)"
  PATH="$clean_path" run run_main
  assert_failure
  assert_output -p "Environment setup failed!"
}

@test ".run_main errors if the downloading and install fails" {
  source ${profile_script}
  PATH="$DESTDIR:$PATH"
  # intentionally missing .gz to fail install
  stub curl \
    "-sL --retry 3 https://install.apollographql.workers.dev/cli/linux/ : cat $FIXTURE_ROOT/apollo-v0.0.1-x86_64-linux.tar"

  run run_main
  assert_failure
  assert_output -p "An error occured installing the tool. The contents of the directory /tmp/tmp."
}