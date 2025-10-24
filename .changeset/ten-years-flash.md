---
"@apollo/composition": patch
---

Fixed handling `@requires` dependency on fields returned by `@interfaceObject`

Depending on the merge order of the types, we could fail composition if a type that `@requires` data from an `@interfaceObject` is merged before the interface. Updated merge logic to use explicit merge order of scalars, input objects, input objects and finally objects.
