---
"@apollo/composition": patch
---

Improve error messages when @composeDirective arguments are NULL or empty strings.

Previous message on undefined/null argument value
`Cannot read properties of undefined (reading '0')`

New message
`Argument to @composeDirective in subgraph "${sg.name}" cannot be NULL or an empty String`
