import {
  type SubtypingRule,
} from "@apollo/federation-internals";

export type CompositionOptions = {
  exposeDirectives?: string[],
  allowedFieldTypeMergingSubtypingRules?: SubtypingRule[],
};
