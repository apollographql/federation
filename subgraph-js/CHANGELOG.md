# CHANGELOG for `@apollo/subgraph`

## vNEXT

> The changes noted within this `vNEXT` section have not been released yet.  New PRs and commits which introduce changes should include an entry in this `vNEXT` section as part of their development.  When a release is being prepared, a new header will be (manually) created below and the appropriate changes within that release will be moved into the new section.

- _Nothing yet! Stay tuned!_

## v0.33.0

- Add flexibility for @tag directive definition validation in subgraphs. @tag definitions are now permitted to be a subset of the spec's definition. This means that within the definition, `repeatable` is optional as are each of the directive locations. [PR #1022](https://github.com/apollographql/federation/pull/1022)