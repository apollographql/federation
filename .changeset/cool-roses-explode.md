---
"@apollo/federation-internals": patch
---

fix: make composeDirective argument non-nullable.

Per our [docs](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/directives#composedirective), 
`@composeDirective` requires non-nullable value to be passed as an argument.

Our [validations](https://github.com/apollographql/federation/blob/main/composition-js/src/composeDirectiveManager.ts#L250-L255) were checking for valid values (it has to be a string that starts with `@`),
but the generated schema was incorrectly specifying that the argument was nullable.
