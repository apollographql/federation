---
title: Configuring OpenTelemetry
sidebar_title: OpenTelemetry
---

[OpenTelemetry](https://opentelemetry.io/) is a collection of open-source tools for generating and processing telemetry data (such as logs and metrics) from different systems in a generic, consistent way.

The `@apollo/gateway` library provides built-in OpenTelemetry instrumentation to emit [traces](https://opentelemetry.io/docs/concepts/data-sources/#traces) with a collection of gateway-specific [spans](https://opentelemetry.io/docs/concepts/data-sources/#traces).

You can also configure your gateway, your individual subgraphs, or even a monolothic Apollo Server instance to emit telemetry related to processing GraphQL operations.

> Apollo Studio does _not_ currently consume OpenTelemetry-formatted data. To push trace data to Studio, see [Federated traces](./metrics/).
>
> You should configure OpenTelemetry if you want to push trace data to an OpenTelemetry-compatible system, such as [Zipkin](https://zipkin.io/) or [Jaeger](https://www.jaegertracing.io/).

## Setup

### 1. Install required libraries

To use OpenTelemetry in your gateway, we recommend installing _at least_ the following `@opentelemetry` Node.js libraries (you can install additional instrumentation libraries as desired):

```bash
npm install \
  @opentelemetry/api \
  @opentelemetry/node@0.22 \
  @opentelemetry/core@0.22 \
  @opentelemetry/instrumentation-http@0.22 \
  @opentelemetry/instrumentation-express@0.22 \
  @opentelemetry/instrumentation-graphql@0.22
```

> As shown, most `@opentelemetry` libraries should maintain a consistent version number to prevent dependency conflicts. As of this article's most recent update, the latest version is `0.22`. 

### 2. Configure instrumentation

Next, update your application to configure your OpenTelemetry instrumentation _as early as possible in your app's execution_. This _must_ occur before you even import `apollo-server`, `express`, or `http`.

**We recommend putting this configuration in its own file**, which you import at the very top of `index.js`.

> Note that for now, this code does _not_ push trace data to an external system. Instead, it prints that data to the console for debugging purposes.

```js:title=open-telemetry.js
// Import required symbols
const { HttpInstrumentation } = require ('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require ('@opentelemetry/instrumentation-express');
const { GraphQLInstrumentation } = require ('@opentelemetry/instrumentation-graphql');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require("@opentelemetry/node");
const { SimpleSpanProcessor, ConsoleSpanExporter } = require ("@opentelemetry/tracing");
const { Resource } = require('@opentelemetry/resources');

// Register generic instrumentation
registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new GraphQLInstrumentation()
  ]
});

const provider = new NodeTracerProvider({
  resource: Resource.default().merge(new Resource({
    "service.name": "gateway",
  })),
});

// Configure a test exporter to print all traces to the console
const consoleExporter = new ConsoleSpanExporter();
provider.addSpanProcessor(
  new SimpleSpanProcessor(consoleExporter)
);

// Register the provider to begin tracing
provider.register();
```

After you make these changes to your app, start it up locally. It should begin printing trace data similar to the following:

```js
{
  traceId: '0ed36c42718622cc726a661a3328aa61',
  parentId: undefined,
  name: 'HTTP POST',
  id: '36c6a3ae19563ec3',
  kind: 1,
  timestamp: 1624650903925787,
  duration: 26793,
  attributes: {
    'http.url': 'http://localhost:4000/',
    'http.host': 'localhost:4000',
    'net.host.name': 'localhost',
    'http.method': 'POST',
    'http.route': '',
    'http.target': '/',
    'http.user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'http.request_content_length_uncompressed': 1468,
    'http.flavor': '1.1',
    'net.transport': 'ip_tcp',
    'net.host.ip': '::1',
    'net.host.port': 4000,
    'net.peer.ip': '::1',
    'net.peer.port': 39722,
    'http.status_code': 200,
    'http.status_text': 'OK'
  },
  status: { code: 1 },
  events: []
}
{
  traceId: '0ed36c42718622cc726a661a3328aa61',
  parentId: '36c6a3ae19563ec3',
  name: 'middleware - <anonymous>',
  id: '3776786d86f24124',
  kind: 0,
  timestamp: 1624650903934147,
  duration: 63,
  attributes: {
    'http.route': '/',
    'express.name': '<anonymous>',
    'express.type': 'middleware'
  },
  status: { code: 0 },
  events: []
}
```