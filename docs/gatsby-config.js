const themeOptions = require('gatsby-theme-apollo-docs/theme-options');

module.exports = {
  plugins: [
    {
      resolve: 'gatsby-theme-apollo-docs',
      options: {
        ...themeOptions,
        root: __dirname,
        pathPrefix: '/docs/federation',
        // algoliaIndexName: 'federation',
        algoliaFilters: [
          'docset:federation',
          ['docset:server', 'docset:rover', 'docset:router', 'docset:studio'],
        ],
        subtitle: 'Federation',
        description: 'A guide to using Apollo Federation',
        githubRepo: 'apollographql/federation',
        sidebarCategories: {
          null: [ 'index', ],
          'Federation 2 Updates': [
            'federation-2/new-in-federation-2',
            'federation-2/moving-to-federation-2',
            'federation-2/backward-compatibility',
            '[🚀 Demo app](https://github.com/apollographql/supergraph-demo-fed2)',
            '[🗺 Roadmap](https://github.com/apollographql/federation/blob/main/ROADMAP.md)',
          ],
          Quickstart: [
            'quickstart/setup',
            'quickstart/studio-composition',
            'quickstart/local-composition',
            'quickstart/local-subgraphs',
          ],
          Implementing: ['subgraphs', 'gateway'],
          'Federated Schemas': [
            'federated-types/overview',
            'federated-types/composition',
            'federated-types/sharing-types',
            'entities',
            'entities-advanced',
          ],
          'Managed Federation': [
            'managed-federation/overview',
            'managed-federation/setup',
            'managed-federation/deployment',
            '[Studio features](https://www.apollographql.com/docs/studio/federated-graphs/)',
          ],
          'Third-Party Support': ['other-servers', 'federation-spec'],
          'API Reference': ['api/apollo-subgraph', 'api/apollo-gateway'],
          'Apollo Workbench': [
            'workbench/overview',
            'workbench/setup',
            'workbench/using-federation-2',
            'workbench/create-new-graph',
            'workbench/import-studio-graph',
            'design-to-studio',
            'workbench/mocking',
            'workbench/exporting',
          ],
        },
      },
    },
  ],
};
