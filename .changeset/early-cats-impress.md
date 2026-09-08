---
"@apollo/composition": patch
---

Fixed `@composeDirective` logic to use correct source for validation

`validateAndFilterExternal` was passing `source.name` (the field name)
instead of `this.names[i]` (the subgraph name) to `isMergedDirective`.
This caused `shouldComposeDirective` to miss `@composeDirective`-composed
directives on external fields, since it looked up the directive under
a nonexistent subgraph name.