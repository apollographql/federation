---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Modifies the type for the argument of the `@requiresScopes` from `[federation__Scope!]!` to `[[federation__Scope!]!]!`.

The `@requiresScopes` directives has been pre-emptively introduced in 2.5.0 to support an upcoming Apollo Router
feature around scoped accesses. The argument for `@requiresScopes` in that upcoming feature is changed to accommodate a
new semantic. Note that this technically a breaking change to the `@requiresScopes` directive definition, but as the
full feature using that directive has been released yet, this directive cannot effectively be used and this should have
no concrete impact.
  
