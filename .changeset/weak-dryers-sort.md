---
"@apollo/subgraph": patch
---

Resolve `Promise` references before calling `__resolveType` on interface

Since the introduction of entity interfaces, users could not return
a `Promise` from `__resolveReference` while implementing a synchronous,
custom `__resolveType` function. This change fixes/permits this use case.

Additional background / implementation details:

Returning a `Promise` from `__resolveReference` has historically never
been an issue. However, with the introduction of entity interfaces, the
calling of an interface's `__resolveType` function became a new concern.

`__resolveType` functions expect a reference (and shouldn't be concerned
with whether those references are wrapped in a `Promise`). In order to
address this, we can `await` the reference before calling the
`__resolveType` (this handles both the non-`Promise` and `Promise` case).
  