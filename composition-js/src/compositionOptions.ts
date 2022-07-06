import {
  type SubtypingRule,
} from "@apollo/federation-internals";

export type CompositionOptions = {
  mergeDirectives?: string[],
  allowedFieldTypeMergingSubtypingRules?: SubtypingRule[],
};
