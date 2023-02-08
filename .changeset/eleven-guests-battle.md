---
"@apollo/gateway": patch
---

Move gateway post-processing errors from `errors` into `extensions.valueCompletion` of the response

[https://github.com/apollographql/federation/pull/2335](PR #2335) introduced a breaking change that broke existing usages with respect to nullability and gateway error handling. In response to [https://github.com/apollographql/federation/issues/2374](Issue #2374), we are reverting the breaking portion of this change by continuing to swallow post processing errors as the gateway did prior to v2.3.0. Instead, those errors will now be included on the `extensions.valueCompletion` object in the response object.

Gateway v2.3.0 and v2.3.1 are both affected by this change in behavior.
  