---
"@apollo/gateway": patch
---

Filter cloud resource detection to only the anonymous data we process

The opt-out telemetry introduced in #3289 ran OpenTelemetry cloud resource detectors (AWS, GCP, Azure, Alibaba Cloud) whose attributes could include infrastructure-identifying values such as account IDs, instance IDs, ARNs, hostnames, function names, and log group/stream names. These attributes are now stripped before export, retaining only the non-identifying `cloud.provider` and `cloud.platform` attributes that Apollo processes on the ingestion side.
