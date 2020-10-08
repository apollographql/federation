# Tracing, PoC

1. Run Jaeger:
   ```shell script
   docker run -d -p6831:6831/udp -p6832:6832/udp -p16686:16686 -p14268:14268 jaegertracing/all-in-one:latest
   ```
2. Run stargate:
   ```shell script
   cd stargate
   cargo run -- --manifest fixtures/acephei.graphql --tracing-endpoint udp://localhost:6831
   ```
3. curl locahost:
   ```shell script
   curl localhost:8080  -d '{"query": "{me{id}}"}' -H "Content-Type: application/json"
   ```
4. Open Jaeger UI: http://localhost:16686/
5. Search for traces under the `stargate` service. You should see one from "a few seconds ago"
