---
title: Federation error codes
sidebar_title: Error codes
---

When Apollo Gateway attempts to **compose** the schemas provided by your [subgraphs](./subgraphs/) into a **supergraph schema**, it confirms that:

* The subgraphs are valid
* The resulting supergraph schema is valid
* The gateway has all of the information it needs to execute operations against the resulting schema

If Apollo Gateway encounters an error, composition fails. This document lists subgraphs and composition error codes and their root causes.


## Errors

The following errors may be raised by composition:

| Code | Description | Since | Comment |
|---|---|---|---|
| `EXTENSION_WITH_NO_BASE` | A subgraph is attempting to `extend` a type that is not originally defined in any known subgraph. | 0.x |  |
| `EXTERNAL_ARGUMENT_DEFAULT_MISMATCH` | An `@external` field declares an argument with a default that is incompatible with the corresponding argument in the declaration(s) of that field in other subgtaphs. | 2.0.0 |  |
| `EXTERNAL_ARGUMENT_MISSING` | An `@external` field is missing some arguments present in the declaration(s) of that field in other subgraphs. | 2.0.0 |  |
| `EXTERNAL_ARGUMENT_TYPE_MISMATCH` | An `@external` field declares an argument with a type that is incompatible with the corresponding argument in the declaration(s) of that field in other subgtaphs. | 2.0.0 |  |
| `EXTERNAL_MISSING_ON_BASE` | A field is marked as `@external` in a subgraph but with no non-external declaration in any other subgraph. | 0.x |  |
| `EXTERNAL_TYPE_MISMATCH` | An `@external` field has a type that is incompatible with the declaration(s) of that field in other subgraphs. | 0.x |  |
| `EXTERNAL_UNUSED` | An `@external` field is not being used by any instance of `@key`, `@requires`, `@provides` or to satisfy an interface implememtation. | 0.x |  |
| `FIELD_ARGUMENT_DEFAULT_MISMATCH` | An argument (of a field/directive) has a default value that is incompatible with that of other declarations of that same argument in other subgraphs. | 2.0.0 |  |
| `FIELD_ARGUMENT_TYPE_MISMATCH` | An argument (of a field/directive) has a type that is incompatible with that of other declarations of that same argument in other subgraphs. | 2.0.0 | Replaces: `VALUE_TYPE_INPUT_VALUE_MISMATCH` |
| `FIELD_TYPE_MISMATCH` | A field has a type that is incompatible with other declarations of that field in other subgraphs. | 2.0.0 | Replaces: `VALUE_TYPE_FIELD_TYPE_MISMATCH` |
| `INPUT_FIELD_DEFAULT_MISMATCH` | An input field has a default value that is incompatible with other declarations of that field in other subgraphs. | 2.0.0 |  |
| `INTERFACE_FIELD_IMPLEM_TYPE_MISMATCH` | For an interface field, some of its concrete implementations have @external or @requires and there is difference in those implementations return type (which is currently not supported; see https://github.com/apollographql/federation/issues/1257) | 2.0.0 |  |
| `INTERFACE_FIELD_NO_IMPLEM` | After subgraph merging, an implemenation is missing a field of one of the interface it implements (which can happen for valid subgraphs). | 2.0.0 |  |
| `INVALID_GRAPHQL` | A schema is invalid GraphQL: it violates one of the rule of the specification. | 2.0.0 |  |
| `INVALID_SUBGRAPH_NAME` | A subgraph name is invalid (subgraph names cannot be a single underscore ("_")). | 2.0.0 |  |
| `KEY_FIELDS_HAS_ARGS` | The `fields` argument of a `@key` directive includes a field defined with arguments (which is not currently supported). | 2.0.0 |  |
| `KEY_FIELDS_SELECT_INVALID_TYPE` | The `fields` argument of `@key` directive includes a field whose type is a list, interface, or union type. Fields of these types cannot be part of a `@key` | 0.x |  |
| `KEY_INVALID_FIELDS_TYPE` | The value passed to the `fields` argument of a `@key` directive is not a string. | 2.0.0 |  |
| `KEY_INVALID_FIELDS` | The `fields` argument of a `@key` directive is invalid (it has invalid syntax, includes unknown fields, ...). | 2.0.0 |  |
| `KEY_UNSUPPORTED_ON_INTERFACE` | A `@key` directive is used on an interface, which is not (yet) supported. | 2.0.0 |  |
| `NO_QUERIES` | None of the composed subgraphs expose any query. | 2.0.0 |  |
| `PROVIDES_FIELDS_HAS_ARGS` | The `fields` argument of a `@provides` directive includes a field defined with arguments (which is not currently supported). | 2.0.0 |  |
| `PROVIDES_FIELDS_MISSING_EXTERNAL` | The `fields` argument of a `@provides` directive includes a field that is not marked as `@external`. | 0.x |  |
| `PROVIDES_INVALID_FIELDS_TYPE` | The value passed to the `fields` argument of a `@provides` directive is not a string. | 2.0.0 |  |
| `PROVIDES_INVALID_FIELDS` | The `fields` argument of a `@provides` directive is invalid (it has invalid syntax, includes unknown fields, ...). | 2.0.0 |  |
| `PROVIDES_ON_NON_OBJECT_FIELD` | A `@provides` directive is used to mark a field whose base type is not an object type. | 2.0.0 |  |
| `PROVIDES_UNSUPPORTED_ON_INTERFACE` | A `@provides` directive is used on an interface, which is not (yet) supported. | 2.0.0 |  |
| `REQUIRES_FIELDS_HAS_ARGS` | The `fields` argument of a `@requires` directive includes a field defined with arguments (which is not currently supported). | 2.0.0 |  |
| `REQUIRES_FIELDS_MISSING_EXTERNAL` | The `fields` argument of a `@requires` directive includes a field that is not marked as `@external`. | 0.x |  |
| `REQUIRES_INVALID_FIELDS_TYPE` | The value passed to the `fields` argument of a `@requires` directive is not a string. | 2.0.0 |  |
| `REQUIRES_INVALID_FIELDS` | The `fields` argument of a `@requires` directive is invalid (it has invalid syntax, includes unknown fields, ...). | 2.0.0 |  |
| `REQUIRES_UNSUPPORTED_ON_INTERFACE` | A `@requires` directive is used on an interface, which is not (yet) supported. | 2.0.0 |  |
| `ROOT_MUTATION_USED` | A subgraph's schema defines a type with the name `mutation`, while also specifying a _different_ type name as the root query object. This is not allowed. | 0.x |  |
| `ROOT_QUERY_USED` | A subgraph's schema defines a type with the name `query`, while also specifying a _different_ type name as the root query object. This is not allowed. | 0.x |  |
| `ROOT_SUBSCRIPTION_USED` | A subgraph's schema defines a type with the name `subscription`, while also specifying a _different_ type name as the root query object. This is not allowed. | 0.x |  |
| `SATISFIABILITY_ERROR` | Subgraphs can be merged, but the resulting supergraph API would have queries that cannot be satisfied by those subgraphs. | 2.0.0 |  |
| `TAG_DIRECTIVE_DEFINITION_INVALID` | The @tag directive has an invalid defintion in the schema. | 0.x |  |
| `TYPE_KIND_MISMATCH` | A type has the same name in different subgraphs, but a different kind. For instance, one definition is an object type but another is an interface. | 2.0.0 | Replaces: `VALUE_TYPE_KIND_MISMATCH`, `EXTENSION_OF_WRONG_KIND`, `ENUM_MISMATCH_TYPE` |


## Removed codes

The following section lists code that have been removed and are not longer generated by the gateway version this is the documentation for.

| Removed Code | Comment |
|---|---|
| `DUPLICATE_ENUM_DEFINITION` | As duplicate enum definitions is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL` |
| `DUPLICATE_ENUM_VALUE` | As duplicate enum values is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL` |
| `DUPLICATE_SCALAR_DEFINITION` | As duplicate scalar definitions is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL` |
| `ENUM_MISMATCH` | Subgraph definitions for an enum are now merged by composition |
| `EXTERNAL_USED_ON_BASE` | As there is not type ownership anymore, there is also no particular limitation as to where a field can be external. |
| `KEY_FIELDS_MISSING_EXTERNAL` | Using `@external` for key fields is now decouraged, unless the field is truly meant to be external. |
| `KEY_FIELDS_MISSING_ON_BASE` | Keys can now use any field from any other subgraph. |
| `KEY_MISSING_ON_BASE` | Each subgraph is now free to declare a key only if it needs it. |
| `KEY_NOT_SPECIFIED` | Each subgraph can declare key independently of any other subgraph. |
| `MULTIPLE_KEYS_ON_EXTENSION` | Every subgraph can have multiple keys, as necessary. |
| `PROVIDES_FIELDS_SELECT_INVALID_TYPE` | @provides can now be used on field of interface, union and list types |
| `PROVIDES_NOT_ON_ENTITY` | @provides can now be used on any type. |
| `REQUIRES_FIELDS_MISSING_ON_BASE` | Fields in @requires can now be from any subgraph. |
| `REQUIRES_USED_ON_BASE` | As there is not type ownership anymore, there is also no particular limitation as to which subgraph can use a @requires. |
| `RESERVED_FIELD_USED` | This error was previously not correctly enforced: the _service and _entities, if present, were overriden; this is still the case |
| `VALUE_TYPE_NO_ENTITY` | There is no strong different between entity and value types in the model (they are just usage pattern) and a type can have keys in one subgraph but not another. |
| `VALUE_TYPE_UNION_TYPES_MISMATCH` | Subgraph definitions for an union are now merged by composition |

