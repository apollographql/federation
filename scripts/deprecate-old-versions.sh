#!/bin/bash

# Some inspiration drawn from Apollo Server's prior art:
# https://github.com/apollographql/apollo-server/blob/5d87be74ca68376b6698fed28adeaccdfcb639ef/scripts/deprecate-old-versions.sh

# As far as we can tell, `npm deprecate` only deprecates currently existing
# package versions. Whenever we publish a backport to v0.x, the latest
# version will end up not deprecated! So after publishing backport versions, we
# run this script (with apollo-bot credentials). As far as we can tell you can't
# use npm tokens for this so it requires you to enter a ton of OTPs. Fun!
# https://stackoverflow.com/questions/74466186/keeping-npm-deprecated-packages-deprecated

set -e

# List of packages to deprecate
packages=("@apollo/gateway" "@apollo/federation" "@apollo/query-planner" "@apollo/subgraph")

for package_name in "${packages[@]}"
do
  # Get all the versions of the package, trim double quotes
  versions=$(npm view $package_name versions --json | tr -d '[],"')
  for version in $versions; do
    # Filter for versions starting with 0.x only
    if [[ $version == 0.* ]]; then
      # Print the version
      echo "Deprecating version: $version of package $package_name"
      # Deprecate the version
      npm deprecate "$package_name@$version" "The `$package_name` package is part of Federation v1, which is now deprecated (end-of-life September 22nd 2023). Please upgrade your package to its latest counterpart. See announcement blog for details (https://www.apollographql.com/blog/announcement/backend/announcing-the-end-of-life-schedule-for-apollo-gateway-v0-x/)."
    fi
  done
done