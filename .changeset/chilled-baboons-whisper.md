---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Automatically propagate authorization requirements from implementing type to interface in the supergraph.

Authorization requirements now automatically propagate from implementing types to interfaces during composition. Direct auth specifications on interfaces are no longer allowed. Interface access requires satisfying ALL implementing types' requirements (`AND` rule), with these requirements included in the supergraph for backward compatibility with older routers.