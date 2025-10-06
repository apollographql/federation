---
"@apollo/federation-internals": patch
---

Update connector spec to allow re-entry

Updates connector spec to follow the same patterns as other federation spec blueprints (i.e. register types/directives in the constructor and use default logic for adding them to the schema that checks whether they need to be added or not).

NOTE: Support for handling input objects in the spec is severely limited and only handles `@connect` spec. For additional details on limitations see #3311.