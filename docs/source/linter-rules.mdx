---
title: Composition hints
---

When you successfully [compose](./federated-types/composition) the schemas provided by your [subgraphs](./building-supergraphs/subgraphs-overview/) into a supergraph schema, the composition process might output **hints** that provide additional information about the result. Hints are primarily informative and _do not_ necessarily indicate that a problem needs to be fixed.

Hints are categorized under the following levels:

* `WARN`: Indicates a situation that might be expected but is usually temporary and should be double-checked. Typically, composition might have needed to ignore some elements from some subgraph when creating the supergraph.
* `INFO`: Suggests a potentially helpful improvement or highlights a noteworthy resolution made by composition. Can otherwise be ignored.
* `DEBUG`: Lower-level information that provides insight into the composition. These hints are of lesser importance/impact.

Note that hints are first and foremost informative and don't necessarily correspond to a problem to be fixed.

This document lists the hints that can be generated for each level, with a description of why each is generated.


The following hints might be generated during composition:

## `WARN`

<div class="sticky-table">

| Code | Description | Level |
|---|---|---|
| `INCONSISTENT_DEFAULT_VALUE_PRESENCE` | Indicates that an argument definition (of a field/input field/directive definition) has a default value in only some of the subgraphs that define the argument. | `WARN` |
| `INCONSISTENT_INPUT_OBJECT_FIELD` | Indicates that a field of an input object type definition is only defined in a subset of the subgraphs that declare the input object. | `WARN` |
| `INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM` | Indicates that a value of an enum type definition (that is only used as an Input type) has not been merged into the supergraph because it is defined in only a subset of the subgraphs that declare the enum | `WARN` |
| `INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE` | Indicates that an executable directive definition is declared in only some of the subgraphs. | `WARN` |
| `NO_EXECUTABLE_DIRECTIVE_INTERSECTION` | Indicates that, for an executable directive definition, no location for it appears in all subgraphs. | `WARN` |
| `INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE` | Indicates that an executable directive definition is marked repeatable in only a subset of the subgraphs (and will not be repeatable in the supergraph). | `WARN` |
| `INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS` | Indicates that an executiable directive definition is declared with inconsistent locations across subgraphs (and will use the intersection of all locations in the supergraph). | `WARN` |
| `INCONSISTENT_DESCRIPTION` | Indicates that an element has a description in more than one subgraph, and the descriptions are not equal. | `WARN` |
| `INCONSISTENT_ARGUMENT_PRESENCE` | Indicates that an optional argument (of a field or directive definition) is not present in all subgraphs and will not be part of the supergraph. | `WARN` |
| `FROM_SUBGRAPH_DOES_NOT_EXIST` | Source subgraph specified by @override directive does not exist | `WARN` |
| `INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS` | A non-repeatable directive is applied to a schema element in different subgraphs but with arguments that are different. | `WARN` |
| `DIRECTIVE_COMPOSITION_WARN` | Indicates that an issue was detected when composing custom directives. | `WARN` |
| `INCONSISTENT_RUNTIME_TYPES_FOR_SHAREABLE_RETURN` | Indicates that a @shareable field returns different sets of runtime types in the different subgraphs in which it is defined. | `WARN` |

</div>

## `INFO`

<div class="sticky-table">

| Code | Description | Level |
|---|---|---|
| `INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE` | Indicates that a field does not have the exact same types in all subgraphs, but that the types are "compatible" (2 types are compatible if one is a non-nullable version of the other, a list version, a subtype, or a combination of the former). | `INFO` |
| `INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE` | Indicates that an argument type (of a field/input field/directive definition) does not have the exact same type in all subgraphs, but that the types are "compatible" (two types are compatible if one is a non-nullable version of the other, a list version, a subtype, or a combination of the former). | `INFO` |
| `INCONSISTENT_ENTITY` | Indicates that an object is declared as an entity (has a `@key`) in only some of the subgraphs in which the object is defined. | `INFO` |
| `OVERRIDDEN_FIELD_CAN_BE_REMOVED` | Field has been overridden by another subgraph. Consider removing. | `INFO` |
| `OVERRIDE_DIRECTIVE_CAN_BE_REMOVED` | Field with @override directive no longer exists in source subgraph, the directive can be safely removed | `INFO` |
| `MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS` | A non-repeatable directive has been applied to a schema element in different subgraphs with different arguments and the arguments values were merged using the directive configured strategies. | `INFO` |
| `DIRECTIVE_COMPOSITION_INFO` | Indicates that an issue was detected when composing custom directives. | `INFO` |

</div>

## `DEBUG`

<div class="sticky-table">

| Code | Description | Level |
|---|---|---|
| `INCONSISTENT_OBJECT_VALUE_TYPE_FIELD` | Indicates that a field of an object "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type. | `DEBUG` |
| `INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD` | Indicates that a field of an interface "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type. | `DEBUG` |
| `INCONSISTENT_UNION_MEMBER` | Indicates that a member of a union type definition is only defined in a subset of the subgraphs that declare the union. | `DEBUG` |
| `INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM` | Indicates that a value of an enum type definition (that is only used as an Output type, or is unused) has been merged in the supergraph but is defined in only a subset of the subgraphs that declare the enum | `DEBUG` |
| `INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE` | Indicates that a type system directive definition is marked repeatable in only a subset of the subgraphs that declare the directive (and will be repeatable in the supergraph). | `DEBUG` |
| `INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS` | Indicates that a type system directive definition is declared with inconsistent locations across subgraphs (and will use the union of all locations in the supergraph). | `DEBUG` |
| `UNUSED_ENUM_TYPE` | Indicates that an enum type is defined in some subgraphs but is unused (no field/argument references it). All the values from subgraphs defining that enum will be included in the supergraph. | `DEBUG` |

</div>
