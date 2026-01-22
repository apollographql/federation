---
"@apollo/gateway": patch
---

Allow bumping `make-fetch-happen` dependency to v15.

This change allows users to upgrade `make-fetch-happen` to v15, which in turn will allow updating the `cacache` dependency from v17 to v20, dropping the `tar` v6 dependency that is marked as vulnerable.

The only breaking changes in `make-fetch-happen` from v11 to v15 are removals of support for old end-of-life Node.js versions. 

There is only one note from the [12.0.0 release](https://github.com/npm/make-fetch-happen/blob/main/CHANGELOG.md#1200-2023-07-27) of `make-fetch-happen` that might be of interest when considering the upgrade:

> this changes the underlying http agents to those provided by @npmcli/agent. Backwards compatibility should be fully implemented but due to the scope of this change it was made a breaking change out of an abundance of caution.

As a result, it should be possible for most users to upgrade from v11 to v15 without any issues.

We still keep the dependency to v11 as an alternative for people that cannot upgrade to v15 for some reason. This will be removed in a future version of `@apollo/gateway`.

Even for users that stay on v11, there should not be any immediate danger. While `cacache` had `tar` v6 as a dependency, it actually never used it. It seems that that dependency had become unused at some point but was never removed. So users on `make-fetch-happen` v11 are not actually affected by the vulnerability in `tar` v6.

The dependency might hold the `tar` package required by other packages back, though. In case an update from v11 to v15 is not possible, users should consider to use the resolution override feature of their package manager to force the dependency from `cacache` to `tar` to either be removed or updated to a newer version. As `cacache` does not actually use `tar`, this should not cause any issues.