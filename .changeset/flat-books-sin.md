---
"@apollo/gateway": patch
---

Exposes, for each subgraph request, the path in the overall gateway operation at which that subgraph request gets inserted. This path is now available as the pathInIncomingRequest field in the arguments of RemoteGraphQLDataSource.willSendRequest and RemoteGraphQLDataSource.didReceiveResponse.