---
"@apollo/gateway": patch
---

Fix fleet-awareness telemetry exporting metrics to the bare usage-reporting endpoint instead of the OTLP `/v1/metrics` route

The opt-out anonymous telemetry pipeline introduced in #3289 configured the OTLP metric exporter with a bare `https://usage-reporting.api.apollographql.com` URL. Because the URL is supplied programmatically (rather than via `OTEL_EXPORTER_OTLP_ENDPOINT`), the `@opentelemetry/exporter-metrics-otlp-http` package does not append the `/v1/metrics` signal path automatically, so every export POSTed to `/` instead of `/v1/metrics`. The exporter now targets the full OTLP metrics route.
