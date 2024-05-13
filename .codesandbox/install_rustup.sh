#!/usr/bin/env bash

# Find out which operating system we're running
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
elif [ -f /etc/debian_version ]; then
  OS=debian
elif [ -f /etc/fedora-release ]; then
  OS=fedora
elif [ -f /etc/centos-release ]; then
  OS=centos
else
  echo "Unsupported operating system"
  exit 1
fi
echo $OS

apt-get install -y build-essential
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
