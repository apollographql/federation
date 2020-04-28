#!/bin/sh
# <body><div class="f"><pre id="flip"><code class="bash">
# Welcome to the Apollo CLI Install script!

set -o errexit

# GitHub's URL for the latest release, will redirect.
DESTDIR="${DESTDIR:-$HOME}"
BIN_PATH="${DESTDIR}/.apollo/bin"
INSTALL_PATH="${BIN_PATH}/ap"

error_exit() {
  echo "$1" 1>&2
  exit 1
}

check_environment_readiness() {
  if [ -z "$(command -v curl)" ]; then
    echo "The curl command is not installed on this machine. Please install curl before installing the Apollo CLI"
    return 1
  fi

  if [ -z "$(command -v tar)" ]; then
    echo "The tar command is not installed on this machine. Please install tar before installing the Apollo CLI"
    return 1
  fi

  if ! [ -d "$DESTDIR" ]; then
    echo "Attempting to install the Apollo CLI in $DESTDIR but that directory wasn't found on your filesystem. Please create a directory by using mkdir $DESTDIR or specify a DESTDIR variable when running the installer"
    return 1
  fi

  if ! [ -w "$DESTDIR" ]; then
    echo "Attempting to install the Apollo CLI in $DESTDIR but the permissions deny writing to that directory."
    return 1
  fi

  EXISTING_APOLLO="$(command -v ap)"
  if [ -n "$EXISTING_APOLLO" ]; then
    echo "An existing version of 'ap' is already installed at $EXISTING_APOLLO. If you want the latest version, please uninstall the old one first then run this again."
    return 1
  fi

  return
}

download_and_install() {
  # Determine release filename. This can be expanded with CPU arch in the future.
  if [ "$(uname)" = "Linux" ]; then
    OS="linux"
  elif [ "$(uname)" = "Darwin" ]; then
    OS="darwin"
  else
    echo "This operating system ('$(uname)') is not supported."
    return 1
  fi

  download_from_proxy || fallback_and_download_from_github

  if ! [ -e "./ap" ] ; then
    echo "After installing the CLI tarball we were unable to find the ap binary"
    return 1
  fi

  mkdir -p "$BIN_PATH"

  mv ap "$BIN_PATH"
  chmod +x "$INSTALL_PATH"

  "$INSTALL_PATH" setup

  return
}


download_from_proxy() {
  RELEASE_URL="https://install.apollographql.com/cli/${OS}/${VERSION}"
  # Download & unpack the release tarball.
  curl -sL --retry 3 "${RELEASE_URL}" | tar zx --strip 1
}

fallback_and_download_from_github() {
  
  echo "Could not install from the Apollo CDN, falling back to GitHub installation"

  if [ -z "$(command -v cut)" ]; then
    echo "The cut command is not installed on this machine. Please install cut before installing the Apollo CLI"
    return 1
  fi

  # GitHub's URL for the latest release, will redirect.
  LATEST_URL="https://github.com/apollographql/apollo-cli/releases/latest/"
  if [ -z "$VERSION" ]; then
    VERSION=$(curl -sLI -o /dev/null -w '%{url_effective}' $LATEST_URL | cut -d "v" -f 2)
  fi

  RELEASE_URL="https://github.com/apollographql/apollo-cli/releases/download/v${VERSION}/ap-v${VERSION}-${OS}.tar.gz"

  # Download & unpack the release tarball.
  curl -sL --retry 3 "${RELEASE_URL}" | tar zx --strip 1
}

run_main() {
  echo "Installing Apollo CLI..."

  check_environment_readiness || error_exit "Environment setup failed!"

   # Run the script in a temporary directory that we know is empty.
  SCRATCH="$(mktemp -d || mktemp -d -t 'tmp')"
  cd "$SCRATCH"

  download_and_install || error_exit "An error occured installing the tool. The contents of the directory $SCRATCH have been left in place to help to debug the issue."

  # Delete the working directory when the install was successful.
  rm -r "$SCRATCH"

  echo "Apollo CLI was successfully installed!"

  return
}

# if we aren't in our testing framework, run the main installer
if [ -z $BATS_RUNNING ] ; then
  run_main
fi

<< 'the end.'
  </code></pre><head>
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <style>body,.hljs{background-color:#f4f6f8!important;color:#f4f6f8}</style>
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+Pro&display=swap" rel="stylesheet"/>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css" rel="stylesheet"/>
    <link href=https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.0.0/styles/github.min.css rel="stylesheet">
    <style>#tip,h1,p{font-family:"Source Sans Pro",sans-serif;color:#333}h1{font-size:1.5rem;margin-bottom:1rem;margin-top:1rem}p{font-size:16px;line-height:24px;max-width:420px;margin:0 auto}.centered{margin-top:25%;position:relative;left:50%;transform:translate(-50%,-50%);text-align:center}#cmd:hover{border:thin solid #f25cc1;animation:alternate pulse-border 2s linear infinite;cursor:pointer}#cmd::selection{background:#f25cc1}.f{display:flex;flex-direction:column-reverse}@keyframes pulse-border{0%{border-color:rgba(255,0,255,0)}100%,50%{border-color:#f25cc1}}</style>
  </head>
  ><div class="centered"> <img src=telescope.svg><h1>Install the Apollo CLI!</h1><p> To install the latest version of the Apollo CLI, <strong>click on the command</strong> below to copy it then run it in your terminal:</p><pre><code id="cmd">curl -sSL https://install.apollographql.com | sh</code></pre><p> If you are curious what the install script does, we've included it below so you can review it before you run it!</p></div></div></body>
  <script>cmd.onclick=(()=>{getSelection().selectAllChildren(cmd),document.execCommand("copy")});</script>
  <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@10.0.0/build/highlight.min.js"></script>
  <script>hljs.initHighlighting()</script>
the end.