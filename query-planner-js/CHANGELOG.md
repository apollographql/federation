# CHANGELOG for `@apollo/query-planner`

## vNEXT

> The changes noted within this `vNEXT` section have not been released yet.  New PRs and commits which introduce changes should include an entry in this `vNEXT` section as part of their development.  When a release is being prepared, a new header will be (manually) created below and the appropriate changes within that release will be moved into the new section.

## v0.3.1

- Narrow `graphql` peer dependency to a more fitting range `^15.4.0` based on our current usage of the package. This requirement was introduced by, but not captured in, changes within the recently released `@apollo/query-planner@0.3.0`. As such, this change will be released as a `patch` since the breaking change already accidentally happened and this is a correction to that oversight. [PR #913](https://github.com/apollographql/federation/pull/913)

# v0.3.0

-  Introduce support for removing @inaccessible elements from the API schema. [PR #807](https://github.com/apollographql/federation/pull/859)
- Mask inaccessible typenames in runtime operation errors. [PR #893](https://github.com/apollographql/federation/pull/893)

# v0.2.3

- Permit @tag and @inaccessible core declarations. [PR #859](https://github.com/apollographql/federation/pull/859)

# v0.2.2

- types: Explicitly declare `FetchGroup[]` return type from `dependentGroups` in `buildQueryPlan`.

# v0.2.1

- Fix plan querying a subgraph with an interface it doesn't know due to directives. [PR #805](https://github.com/apollographql/federation/pull/805) [Issue #801](https://github.com/apollographql/federation/issues/801)

# v0.2.0

- Expand the range of supported `node` versions in the package's `engines` specifier to include the now-tested Node.js `16`. [PR #713](https://github.com/apollographql/federation/pull/713)

# v0.1.4

- Add missing `deep-equal` dependency, which was accidentally installed to the monorepo's root. [PR #709](https://github.com/apollographql/federation/pull/709)

# v0.1.3

- Fix query plans missing fields in some situations involving nested type conditions (#396).
- Fix duplicate fetches in query plans [PR #671](https://github.com/apollographql/federation/pull/671).

# v0.1.2

- This change is mostly a set of follow-up changes for PR #622. Most of these changes are internal (renaming, etc.). Some noteworthy changes worth mentioning are: the splitting of entity and value type metadata types and a conversion of GraphMap to an actual `Map` (which resulted in some additional assertions). [PR #656](https://github.com/apollographql/federation/pull/656)

# v0.1.1

- Remove unnecessary dependency on `@apollo/query-planner-wasm`

# v0.1.0

- Initial release of TypeScript query planner code extracted from `@apollo/gateway`. (Previous releases of this package were wrappers around `@apollo/query-planner-wasm`, a different implementation.)

