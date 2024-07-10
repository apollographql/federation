---
"@apollo/composition": minor
"@apollo/federation-internals": minor
---

Implements two new directives for defining custom costs for demand control. The `@cost` directive allows setting a custom weight to a particular field in the graph, overriding the default cost calculation. The `@listSize` directive gives the cost calculator information about how to estimate the size of lists returned by subgraphs. This can either be a static size or a value derived from input arguments, such as paging parameters.
