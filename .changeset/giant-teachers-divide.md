---
"@apollo/composition": patch
---

Propagate directives from @interfaceObject fields to @external implementations

When an implementation re-declares a field as `@external` (e.g. to reference it in `@requires`), the field's only 
resolvable definition lives on the abstracting `@interfaceObject`. Directives like `@tag` applied there were not 
being propagated to the implementation's copy in the supergraph.

During `add_interface_object_fields`, detect implementation fields where every `@join__field` is `external: true` and 
the field is provided by an `@interfaceObject`, then copy applicable directives onto the implementation field.
