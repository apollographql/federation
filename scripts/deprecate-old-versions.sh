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

deprecate_all_v0_of_package_with_message() {
  local package_name=$1
  local deprecation_message=$2

  # Get all the versions of the package, trim double quotes
  versions=$(npm view $package_name versions --json | tr -d '[],"')
  for version in $versions; do
    # Filter for versions starting with 0. only
    if [[ $version == 0.* ]]; then
      # Print the version
      echo "Deprecating version: $package_name@$version"
      # Deprecate the version
      npm deprecate "$package_name@$version" "$deprecation_message"
    fi
  done
}

deprecate_all_v0_of_package_with_message "@apollo/gateway" "All v0.x versions of @apollo/gateway are now deprecated (end-of-life September 22, 2023). Apollo recommends upgrading to v2.x or migrating to the Apollo Router as soon as possible. For more details, see our announcement blog post (https://www.apollographql.com/blog/announcement/backend/announcing-the-end-of-life-schedule-for-apollo-gateway-v0-x/) and documentation (https://www.apollographql.com/docs/federation/federation-2/backward-compatibility/#is-official-support-ending-for-apollogateway-v0x)."

deprecate_all_v0_of_package_with_message "@apollo/federation" "The @apollo/federation package is deprecated and will reach end-of-life September 22, 2023. It contains outdated utilities for both running subgraphs and composing supergraph schemas. Please migrate to the appropriate package for your use case (@apollo/subgraph or @apollo/composition). For more details, see our announcement blog post (https://www.apollographql.com/blog/announcement/backend/announcing-the-end-of-life-schedule-for-apollo-gateway-v0-x/) and documentation (https://www.apollographql.com/docs/federation/federation-2/backward-compatibility/#is-official-support-ending-for-apollogateway-v0x)."

deprecate_all_v0_of_package_with_message "@apollo/query-planner" "All v0.x versions of the @apollo/query-planner package are now deprecated with an end-of-life date of September 22, 2023. This package is an internal, undocumented package for use in @apollo/gateway. Apollo recommends upgrading to v2.x as soon as possible. For more details, see our announcement blog post (https://www.apollographql.com/blog/announcement/backend/announcing-the-end-of-life-schedule-for-apollo-gateway-v0-x/) and documentation (https://www.apollographql.com/docs/federation/federation-2/backward-compatibility/#is-official-support-ending-for-apollogateway-v0x)."

deprecate_all_v0_of_package_with_message "@apollo/subgraph" "All v0.x versions of @apollo/subgraph are now deprecated with an end-of-life date of September 22, 2023. Apollo recommends upgrading to v2.x as soon as possible. For more details, see our announcement blog post (https://www.apollographql.com/blog/announcement/backend/announcing-the-end-of-life-schedule-for-apollo-gateway-v0-x/) and documentation (https://www.apollographql.com/docs/federation/federation-2/backward-compatibility/#is-official-support-ending-for-apollogateway-v0x)."