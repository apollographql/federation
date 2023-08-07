---
"@apollo/federation-internals": patch
---

Expands over-eager merging of field fix to handle `@defer` consistently

The previously committed [#2713](https://github.com/apollographql/federation/pull/2713) fixed an issue introduced by
[#2387](https://github.com/apollographql/federation/pull/2387), ensuring that querying the same field with different
directives applications was not merged, similar to what was/is done for fragments. But the exact behaviour slightly
differs between fields and fragments when it comes to `@defer` in that for fragments, we never merge 2 similar fragments
where both have `@defer`, which we do merge for fields. Or to put it more concretely, in the following query:
```graphq
query Test($skipField: Boolean!) {
  x {
    ... on X @defer {
      a
    }
    ... on X @defer {
      b
    }
  }
}
```
the 2 `... on X @defer` are not merged, resulting in 2 deferred sections that can run in parallel. But following
[#2713](https://github.com/apollographql/federation/pull/2713), query:
```graphq
query Test($skipField: Boolean!) {
  x @defer {
    a
  }
  x @defer {
    b
  }
}
```
_will_ merge both `x @defer`, resulting in a single deferred section.

This fix changes that later behaviour so that the 2 `x @defer` are not merged and result in 2 deferred sections,
consistently with both 1) the case of fragments and 2) the behaviour prior to
[#2387](https://github.com/apollographql/federation/pull/2387).
  