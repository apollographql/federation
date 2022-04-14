---
title: Federation Hints
sidebar_title: Hints
---

When you successfully [compose](./federated-types/composition) the schemas provided by your [subgraphs](./subgraphs/) into a **supergraph schema**, "hints" may provide additional information about the composition. Hints are first and foremost informative and don't necessarily correspond to a problem to be fixed.

Hints are categorized under the following levels:
1. WARN: indicates a situation that may be expected but is usually temporary and should be double-checked. Typically, composition might have had to ignore some elements from some subgraph when creating the supergraph.
2. INFO: information that may hint at some improvements or highlight noteworthy resolution made by composition but can otherwise be ignored.
3. DEBUG: lower-level information that gives insights into the composition but of lesser importance/impact.

Note that hints are first and foremost informative and don't necessarily correspond to a problem to be fixed.

This document lists the hints that can be generated for each level, with a description of why they are generated.


## Hints

The following hints might be generated during composition:

### WARN

| Level | Code | Description |
|---|---|---|
| `WARN` | `INCONSISTENT_DEFAULT_VALUE_PRESENCE` | Indicates that an argument definition (of a field/input field/directive definition) has a default value in only some of the subgraphs that define the argument. |
| `WARN` | `INCONSISTENT_INPUT_OBJECT_FIELD` | Indicates that a field of an input object type definition is only defined in a subset of the subgraphs that declare the input object. |
| `WARN` | `INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM` | Indicates that a value of an enum type definition (that is only used as an Input type) has not been merged into the supergraph because it is defined in only a subset of the subgraphs that declare the enum |
| `WARN` | `INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE` | Indicates that an executable directive definition is declared in only some of the subgraphs. |
| `WARN` | `NO_EXECUTABLE_DIRECTIVE_INTERSECTION` | Indicates that, for an executable directive definition, no location for it appears in all subgraphs. |
| `WARN` | `INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE` | Indicates that an executable directive definition is marked repeatable in only a subset of the subgraphs (and will not be repeatable in the supergraph). |
| `WARN` | `INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS` | Indicates that an executiable directive definition is declared with inconsistent locations across subgraphs (and will use the intersection of all locations in the supergraph). |
| `WARN` | `INCONSISTENT_DESCRIPTION` | Indicates that an element has a description in more than one subgraph, and the descriptions are not equal. |
| `WARN` | `INCONSISTENT_ARGUMENT_PRESENCE` | Indicates that an optional argument (of a field or directive definition) is not present in all subgraphs and will not be part of the supergraph. |
| `WARN` | `FROM_SUBGRAPH_DOES_NOT_EXIST` | Source subgraph specified by @override directive does not exist |


### INFO

| Level | Code | Description |
|---|---|---|
| `INFO` | `INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE` | Indicates that a field does not have the exact same types in all subgraphs, but that the types are "compatible" (2 types are compatible if one is a non-nullable version of the other, a list version, a subtype, or a combination of the former). |
| `INFO` | `INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE` | Indicates that an argument type (of a field/input field/directive definition) does not have the exact same type in all subgraphs, but that the types are "compatible" (two types are compatible if one is a non-nullable version of the other, a list version, a subtype, or a combination of the former). |
| `INFO` | `INCONSISTENT_ENTITY` | Indicates that an object is declared as an entity (has a `@key`) in only some of the subgraphs in which the object is defined. |
| `INFO` | `OVERRIDDEN_FIELD_CAN_BE_REMOVED` | Field has been overridden by another subgraph. Consider removing. |
| `INFO` | `OVERRIDE_DIRECTIVE_CAN_BE_REMOVED` | Field with @override directive no longer exists in source subgraph, the directive can be safely removed |


### DEBUG

| Level | Code | Description |
|---|---|---|
| `DEBUG` | `INCONSISTENT_OBJECT_VALUE_TYPE_FIELD` | Indicates that a field of an object "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type. |
| `DEBUG` | `INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD` | Indicates that a field of an interface "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type. |
| `DEBUG` | `INCONSISTENT_UNION_MEMBER` | Indicates that a member of a union type definition is only defined in a subset of the subgraphs that declare the union. |
| `DEBUG` | `INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM` | Indicates that a value of an enum type definition (that is only used as an Output type, or is unused) has been merged in the supergraph but is defined in only a subset of the subgraphs that declare the enum |
| `DEBUG` | `INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE` | Indicates that a type system directive definition is marked repeatable in only a subset of the subgraphs that declare the directive (and will be repeatable in the supergraph). |
| `DEBUG` | `INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS` | Indicates that a type system directive definition is declared with inconsistent locations across subgraphs (and will use the union of all locations in the supergraph). |
| `DEBUG` | `UNUSED_ENUM_TYPE` | Indicates that an enum type is defined in some subgraphs but is unused (no field/argument references it). All the values from subgraphs defining that enum will be included in the supergraph. |

