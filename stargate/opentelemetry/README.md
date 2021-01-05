# Tracing, Metrics: PoC

**From this folder:**

1. Run Jaeger:
   ```shell script
   docker run -d -p6831:6831/udp -p6832:6832/udp -p16686:16686 -p14268:14268 jaegertracing/all-in-one:latest
   ```
1. Run Prometheus:
   ```shell script
   docker run -v $(pwd)/prometheus.yaml:/etc/prometheus/prometheus.yml -p9090:9090 prom/prometheus:latest
   ```
1. Run stargate:
   ```shell script
   cd stargate
   cargo run -- --manifest fixtures/acephei.graphql --tracing-endpoint udp://localhost:6831
   ```
1. curl locahost :
   ```shell script
   curl localhost:8080  -d '{"query": "{me{id}}"}' -H "Content-Type: application/json"
   ```
1. Open Jaeger UI: http://localhost:16686/
1. Search for traces under the `stargate` service. You should see one from "a few seconds ago"
