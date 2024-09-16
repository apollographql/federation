---
"@apollo/composition": patch
---

Relax error for detecting whether `@external` field matches. If the external field has extra optional parameters, allow it to pass composition as being able to pass the parameter is not necessary for a required field.
