

# Get started with Apollo Enterprise 2021





### Step 1: Sign in to Apollo Studio.

If you don’t have an Apollo Studio account please create one now. If you already have an account, just log in to the account you’d like to use.

1. Go to [studio.apollographql.com](https://studio.apollographql.com/) and click **Create an account**.

    _You can sign up with either your GitHub identity or a username and password._

2. Complete the signup flow, which includes:

    * Creating an [organization](./org/organizations/) that you can invite teammates to

    * [Selecting a plan](https://www.apollographql.com/pricing/) for your organization (the Free plan is always free, and the Team plan provides a free trial of paid features)

[*See more: Create your account*](https://www.apollographql.com/docs/studio/getting-started/#1-create-your-account)

### Step 2: Create a graph in Studio.

In Studio, each **graph** corresponds to a data graph and its associated GraphQL schema. Your first graph will use your GraphQL server's schema.

1. Visit [studio.apollographql.com](https://studio.apollographql.com/) again. Now that you have an account, this opens Studio.

    The list of organizations you belong to appears in the left column:

    <img src="./img//organization-list.png" class="screenshot" alt="Schema history tab in Studio"></img>

2. Select the organization that you want to add your graph to. Then, click **New Graph** in the upper right.

3. Specify a name for your graph and click **Next**.

    * A graph's name must be globally unique across all of Studio. We recommend using a consistent prefix across all of your organization's graphs.

4. Studio displays instructions for registering your schema, which is also described in the next step.

[*See more: Create your first graph*](https://www.apollographql.com/docs/studio/getting-started/#2-create-your-first-graph)

### Step 3: Install Rover, your new best friend.

Rover is our helpful new CLI for interacting with Apollo. You can install Rover on Mac or Linux with a simple curl command:


```
curl -sSL https://raw.githubusercontent.com/apollographql/rover/v0.0.4/installers/binstall/scripts/nix/install.sh | sh
```


Once you’ve installed Rover, restart your terminal to make sure the CLI is available.

[*See more: Rover installation*](https://www.apollographql.com/docs/rover/getting-started/)

### Step 4: Register your subgraphs.

Federation is all about combining multiple GraphQL services together. We call these distinct services **subgraphs**, which all get composed together to form a single **supergraph**.

For this composition to work you first have to register your subgraphs with Apollo. Rover makes this easy.


```
rover subgraph publish <GRAPH_REF> --profile <profile-name> --routing-url <routing-url> --schema <schema> --name <subgraph>
```


Repeat this for each subgraph you want to include in your supergraph.

[*See more: Register subgraph schemas*](https://www.apollographql.com/docs/federation/managed-federation/setup/#2-register-all-implementing-service-schemas)

### Step 5: Configure and deploy your gateway.
**TODO: we need to consolidate the substeps here.**

First, let's install the necessary packages:

```shell
npm install @apollo/gateway apollo-server graphql
```

The `@apollo/gateway` package includes the [`ApolloGateway` class](/api/apollo-gateway/). To configure Apollo Server to act as a gateway, you pass an instance of `ApolloGateway` to the `ApolloServer` constructor, like so:

```js
const { ApolloServer } = require('apollo-server');
const { ApolloGateway } = require('@apollo/gateway');

// Initialize an ApolloGateway instance and pass it an array of
// your implementing service names and URLs
const gateway = new ApolloGateway({
  serviceList: [
    { name: 'accounts', url: 'http://localhost:4001' },
    // Define additional services here
  ],
});

// Pass the ApolloGateway to the ApolloServer constructor
const server = new ApolloServer({
  gateway,

  // Disable subscriptions (not currently supported with ApolloGateway)
  subscriptions: false,
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
```

In the above example, we provide the `serviceList` configuration option to the
`ApolloGateway` constructor. This array specifies a `name` and `url` for each
of our implementing services. You can specify any string value for `name`, which
is used primarily for query planner output, error messages, and logging.

> In production, we recommend running the gateway in a **managed mode** with Apollo Studio, which relies on static files rather than introspection. For details, see [Setting up managed federation](https://www.apollographql.com/docs/studio/managed-federation/setup/).

On startup, the gateway fetches each implementing service's schema from its `url` and composes those schemas into a single federated data graph. It then begins accepting incoming requests and creates query plans for them that execute across one or more services.

> If there are any composition errors, the `new ApolloServer` call throws an exception
> with a list of [validation errors](/errors/).


**TODO: reconcile the gateway setup (above) w/ managed federation setup docs (below) into a from-scratch setup of a gateway with managed federation.**

#### Modify the gateway

> This section assumes you are using Apollo Server with the `@apollo/gateway` library as your gateway.

If you've already set up Apollo Federation _without_ Apollo Studio, the constructor of your `ApolloGateway` instance probably includes a `serviceList` option, like this:

```js
const gateway = new ApolloGateway({
  serviceList: [
    { name: 'Products', url: 'http://products-graphql.svc.cluster.local:4001/' },
    // Additional services defined here
  ],
});
```

This option specifies the name and URL for each of your graph's implementing services. With managed federation, this information is no longer hardcoded in the gateway's constructor! Instead, the gateway regularly polls Apollo for this information. This enables you to add and remove implementing services from your graph _without_ needing to restart your gateway.

Remove the `serviceList` argument from your `ApolloGateway` constructor entirely:

```js
const gateway = new ApolloGateway();
```

#### Connect the gateway to Studio

Like your implementing services, your gateway uses an API key to identify itself to Studio.

<ObtainGraphApiKey />

Provide your API key to your gateway by setting it as the value of the `APOLLO_KEY` environment variable (`ENGINE_API_KEY` in `apollo-server` pre-2.13.0) in your gateway's environment. Apollo Server will automatically read this environment variable on startup.

Note that if you specify the API key in a `.env` file, the gateway does _not_ automatically read this file. Use a library such as [`dotenv`](https://www.npmjs.com/package/dotenv).

> When running your gateway in an environment where outbound traffic to the internet is restricted, consult the [directions for configuring a proxy](https://www.apollographql.com/docs/apollo-server/proxy-configuration/) within Apollo Server.

#### Deploy the modified gateway

You can now deploy your modified gateway to begin fetching your federated schema from Studio instead of directly from your services.

On startup, your gateway will use its API key to access its federation config from Google Cloud Storage. After it completes schema composition based on the config, the gateway can begin executing operations across your implementing services.


### Step 6: Report metrics and operations from your subgraph servers.

To take advantage of Studio’s observability and delivery capabilities you must enable request tracing.

Apollo Studio can ingest operation **traces** from your GraphQL server to provide performance metrics for your data graph. A trace corresponds to the execution of a single GraphQL operation, including a breakdown of the timing and error information for each field that's resolved as part of the operation.

Trace reporting enables you to visualize:

* Which operations are being executed
* Which clients are executing which operations
* Which parts of the schema are used most
* Which of your resolvers in the server are acting as bottlenecks

#### Pushing traces from Apollo Server

Apollo Server has built-in support for pushing traces to Apollo Studio. To set it up, you provide it a **graph API key** from Studio.

> **API keys are secret credentials.** Never share them outside your organization or commit them to version control. Delete and replace API keys that you believe are compromised.

1. Go to [studio.apollographql.com](https://studio.apollographql.com/) and click the graph you want to obtain an API key for.

2. **If a "Publish your Schema" dialog appears**, select the **From Apollo Server** tab. Copy the value that appears after `APOLLO_KEY=` in the instructions (it begins with `service:`), and you're all set.

    **Otherwise**, proceed to the next step.

2. Open your graph's Settings page and scroll down to the API Keys section. Either copy an existing key or click **Create New Key**.

3. Optionally click the `…` button to the right of the API key to give it a name, such as `Production`. This helps you keep track of each API key's use.

4. Copy the key's value.

After you obtain a graph API key, assign it to the `APOLLO_KEY` environment variable (`ENGINE_API_KEY` prior to version 2.13.0 of Apollo Server) in your production server's environment.

> Consult your production environment's documentation to learn how to set its environment variables.

Now the next time you start your production server, it will automatically begin pushing trace data to Studio:

<img src="./img//metrics.jpg" class="screenshot" alt="Apollo Studio metrics view"></img>

You can also push trace data from environments besides production, such as a staging or beta server. To keep this data separate from your production data, learn how to [create variants of your graph](./org/graphs/#managing-variants).

For advanced configuration options, see [Metrics and logging](https://www.apollographql.com/docs/apollo-server/features/metrics/).

### Step 7: Test your graph with Explorer!
The Apollo Studio Explorer is a powerful web IDE for creating, running, and managing GraphQL operations.

https://www.youtube.com/watch?v=j8b0Bda_TIw

[*See more: Get started with Explorer*](https://www.apollographql.com/docs/studio/explorer/)

### Step 8: Test a change against actual traffic with Checks!

Now that your graph is live and serving traffic, you want to be careful about any changes you make - you don’t want to make a breaking change! This is why we offer Operation Checks.

**TODO: we need docs for running Checks via Rover**


### Step 9: Set up CI/CD integration

Schema checks is especially useful when you add it to your continuous integration pipeline (such as Jenkins or CircleCI). By doing so, you can obtain results and display them directly on your team's pull requests.

We recommend defining a separate CI job for each variant of your schema (production, staging, etc.) you want to validate your changes against. The `rover subgraph:check` command returns a non-zero exit code when it detects a breaking change, meaning the job will fail when the check fails.

[CircleCI](https://www.apollographql.com/docs/studio/schema-checks/#example-configuration)


[GitHub](https://www.apollographql.com/docs/studio/schema-checks/#integrating-with-github)


[Other](https://www.apollographql.com/docs/studio/schema-checks/#integrating-with-other-version-control-services)

[*See more: Set up CI/CD integration*](https://www.apollographql.com/docs/studio/schema-checks/#using-with-continuous-integration)

### Step 10: Set up Checks


Checks: [Schema checks - Studio](https://www.apollographql.com/docs/studio/schema-checks/)


Federated Checks: [Checking Changes to a Federated Graph](https://www.apollographql.com/docs/federation/managed-federation/overview/#checking-changes-to-a-federated-graph)


### Step 11: Check and push a change through GitHub!


Open a PR in GitHub -> check

See Checks in GH

View Checks in Studio

Merge PR -> push

View History in Studio
