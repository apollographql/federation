---
"@apollo/query-planner": patch
---

Fixed a bug where, when composing fetch groups, the query planner would select a key field on a parent group, without checking if the field is defined in the respective schema. This happened particularly when optimizing fetch groups that satisfy @requires conditions. With these changes, the query planner will properly resolve a selectable key from the parent group's schema.
