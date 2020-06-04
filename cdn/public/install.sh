#!/bin/sh
# <body><div class="f"><pre id="flip"><code class="bash">
# Welcome to the Apollo CLI Install script!

# Options
#
#   -V, --verbose
#     Enable verbose output for the installer
#
#   -f, -y, --force, --yes
#     Skip the confirmation prompt during installation

set -o errexit
printf "\n"

BOLD="$(tput bold 2>/dev/null || echo '')"
GREY="$(tput setaf 0 2>/dev/null || echo '')"
UNDERLINE="$(tput smul 2>/dev/null || echo '')"
RED="$(tput setaf 1 2>/dev/null || echo '')"
GREEN="$(tput setaf 2 2>/dev/null || echo '')"
YELLOW="$(tput setaf 3 2>/dev/null || echo '')"
BLUE="$(tput setaf 4 2>/dev/null || echo '')"
MAGENTA="$(tput setaf 5 2>/dev/null || echo '')"
NO_COLOR="$(tput sgr0 2>/dev/null || echo '')"

info() {
  printf "${BOLD}${GREY}>${NO_COLOR} $@\n"
}

warn() {
  printf "${YELLOW}! $@${NO_COLOR}\n"
}

error() {
  printf "${RED}x $@${NO_COLOR}\n" >&2
}

complete() {
  printf "${GREEN}✓${NO_COLOR} $@\n"
}

confirm() {
  if [ -z "${FORCE-}" ]; then
    printf "${MAGENTA}?${NO_COLOR} $@ ${BOLD}[y/N]${NO_COLOR} "
    set +e
    read -r yn < /dev/tty
    rc=$?
    set -e
    if [ $rc -ne 0 ]; then
      error "Error reading from prompt (please re-run with the \`--yes\` option)"
      exit 1
    fi
    if [ "$yn" != "y" ] && [ "$yn" != "yes" ]; then
      error "Aborting (please answer \"yes\" to continue)"
      exit 1
    fi
  fi
}


error_exit() {
  error "$1"
  exit 1
}

# GitHub's URL for the latest release, will redirect.
DESTDIR="${DESTDIR:-$HOME}"
BIN_PATH="${DESTDIR}/.apollo/bin"
INSTALL_PATH="${BIN_PATH}/ap"

detect_os() {
  local os
  os="$(uname)"

  # Determine release filename. This can be expanded with CPU arch in the future.
  if [ "$(uname)" = "Linux" ]; then
    os="linux"
  elif [ "$(uname)" = "Darwin" ]; then
    os="darwin"
  else
    error "This operating system ('$(uname)') is not supported."
    return 1
  fi

  echo "${os}"
}

OS="$(detect_os)"

check_environment_readiness() {
  if [ -z "$(command -v curl)" ]; then
    error "The curl command is not installed on this machine. Please install curl before installing the Apollo CLI"
    return 1
  fi

  if [ -z "$(command -v tar)" ]; then
    error "The tar command is not installed on this machine. Please install tar before installing the Apollo CLI"
    return 1
  fi

  if ! [ -d "$DESTDIR" ]; then
    error "Attempting to install the Apollo CLI in $DESTDIR but that directory wasn't found on your filesystem. Please create a directory by using mkdir $DESTDIR or specify a DESTDIR variable when running the installer"
    return 1
  fi

  return
}

prepare_installation() {
  local sudo_command
  local msg
  local install="$(command -v ap)"

  
  if [ -n "$install" ]; then
    warn "An existing version of 'ap' is already installed at $install.\n"

    if [ -w "$install" ]; then
      sudo_command=""
      msg="Remove previous install at $install"
    else
      warn "Escalated permission are required to remove previous build at ${install}"
      sudo -v || (error "Aborting installation (Please provide root password)"; exit 1)
      sudo_command="sudo"
      msg="Remove previous install at $install as root"
    fi

    confirm "$msg"

    ${sudo_command} rm -rf $install

    echo
  fi
}

download_and_install() {

  download_from_proxy || fallback_and_download_from_github

  if ! [ -e "./ap" ] ; then
    error "After installing the CLI tarball we were unable to find the ap binary"
    return 1
  fi

  if ! [ -w "$DESTDIR" ]; then
    echo "Attempting to install the Apollo CLI in $DESTDIR but the permissions deny writing to that directory."
    return 1
  fi

  mkdir -p "$BIN_PATH"
  
  mv ap "$BIN_PATH"
  chmod +x "$INSTALL_PATH"

  if ! [ -w "/usr/local/bin" ]; then
    info "Adding the ${BIN_PATH} to your PATH..."
    "$INSTALL_PATH" setup
    echo
  else 
    # create symlink to /usr/local/bin for global path usage
    ln -s "${INSTALL_PATH}" "/usr/local/bin"
  fi
  
  complete "Installed Apollo CLI in $INSTALL_PATH!
To learn about all you can do with the Apollo CLI run

  ap help
  "
  return
}


download_from_proxy() {
  RELEASE_URL="https://install.apollographql.com/cli/${OS}/${VERSION}"
  if [ -n "${VERBOSE-}" ]; then
    info "Installing CLI from ${MAGENTA}$RELEASE_URL${NO_COLOR}"
    info "Output of tarball:\n"
  fi
  # Download & unpack the release tarball.
  curl -sL --retry 3 "${RELEASE_URL}" | tar zx${VERBOSE} --strip 1
}

fallback_and_download_from_github() {
  
  warn "Could not install from the Apollo CDN, falling back to GitHub installation\n"

  if [ -z "$(command -v cut)" ]; then
    error "The cut command is not installed on this machine. Please install cut before installing the Apollo CLI"
    return 1
  fi

  # GitHub's URL for the latest release, will redirect.
  LATEST_URL="https://github.com/apollographql/rust/releases/latest/"
  if [ -z "$VERSION" ]; then
    VERSION=$(curl -sLI -o /dev/null -w '%{url_effective}' $LATEST_URL | cut -d "v" -f 2)
  fi

  RELEASE_URL="https://github.com/apollographql/rust/releases/download/v${VERSION}/ap-v${VERSION}-${OS}.tar.gz"

  if [ -n "${VERBOSE-}" ]; then
    info "Installing CLI from ${MAGENTA}$RELEASE_URL${NO_COLOR}"
    info "Output of tarball:\n"
  fi
  # Download & unpack the release tarball.
  curl -sL --retry 3 "${RELEASE_URL}" | tar zx${VERBOSE} --strip 1
}

# parse argv variables
while [ "$#" -gt 0 ]; do
  case "$1" in
    -b|--install-dir) DESTDIR="$2"; shift 2;;
    -V|--verbose) VERBOSE=1; shift 1;;
    -f|-y|--force|--yes) FORCE=1; shift 1;;

    -b=*|--install-dir=*) DESTDIR="${1#*=}"; shift 1;;
    -V=*|--verbose=*) VERBOSE="${1#*=}"; shift 1;;
    -f=*|-y=*|--force=*|--yes=*) FORCE="${1#*=}"; shift 1;;
    *) error "Unknown option: $1"; exit 1;;
  esac
done

run_main() {
  info "Installing Apollo CLI..."

  echo

  printf "  ${UNDERLINE}Configuration${NO_COLOR}\n"
  info "${BOLD}Bin directory${NO_COLOR}: ${GREEN}${BIN_PATH}${NO_COLOR}"
  info "${BOLD}Platform${NO_COLOR}:      ${GREEN}${OS}${NO_COLOR}"

  if [ -n "${VERSION-}" ]; then
    info "${BOLD}Version${NO_COLOR}:       ${GREEN}$VERSION${NO_COLOR}"
  else
    info "${BOLD}Version${NO_COLOR}:       ${GREEN}latest${NO_COLOR}"
  fi

  # non-empty VERBOSE enables verbose untarring
  if [ -n "${VERBOSE-}" ]; then
    VERBOSE=v
    info "${BOLD}Verbose${NO_COLOR}:       ${GREEN}yes${NO_COLOR}"
  else
    VERBOSE=
  fi

  echo
  confirm "Install the Apollo CLI to ${BOLD}${GREEN}${DESTDIR}${NO_COLOR}?"
  

  check_environment_readiness || error_exit "Environment checks failed!"

  prepare_installation

   # Run the script in a temporary directory that we know is empty.
  SCRATCH="$(mktemp -d || mktemp -d -t 'tmp')"
  cd "$SCRATCH"

  info "Installing the Apollo CLI to ${BOLD}${GREEN}${BIN_PATH}${NO_COLOR}..."

  download_and_install || error_exit "An error occured installing the tool. The contents of the directory $SCRATCH have been left in place to help to debug the issue."

  # Delete the working directory when the install was successful.
  rm -r "$SCRATCH"
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
