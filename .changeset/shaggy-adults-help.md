---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---
Allow interface object fields to specify access control

Update composition logic to allow specifying access control directives (`@authenticated`, `@requiresScopes` and `@policy`) on `@interfaceObject` fields. While we disallow access control on interface types and fields, we decided to support it on `@interfaceObject` as it is a useful pattern to define a single resolver (that may need access controls) for common interface fields. Alternative would require our users to explicitly define resolvers for all implementations which defeats the purpose of `@interfaceObject`.

This PR refactors in how we propagate access control by providing additional merge sources when merging directives on interfaces, interface fields and object fields.
