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
          ['docset:server', 'docset:rover', 'docset:studio'],
        ],
        subtitle: 'Federation 2 alpha',
        description: 'A guide to using Apollo Federation',
        githubRepo: 'apollographql/federation',
        defaultVersion: '1',
        versions: {
            '1': 'version-0.x',
            '2': 'main',
        },
        sidebarCategories: {
          null: [ 'index', ],
          'Federation 2 Updates': [
            'federation-2/new-in-federation-2',
            'federation-2/coming-to-federation-2',
            'federation-2/moving-to-federation-2',
            'federation-2/backward-compatibility',
          ],
          Quickstart: [
            'quickstart',
            'quickstart-pt-2',
            'quickstart-pt-3',
            'quickstart-pt-4',
          ],
          Implementing: ['subgraphs', 'gateway'],
          'Federated Schemas': [
            'federated-types/overview',
            'federated-types/composition',
            'entities',
            'federated-types/types-fields',
            'federated-types/migrating-types-fields',
            'federated-types/restricting-types-fields',
          ],
          'Managed Federation': [
            'managed-federation/overview',
            'managed-federation/setup',
            'managed-federation/deployment',
            '[Studio features](https://www.apollographql.com/docs/studio/federated-graphs/)',
          ],
          'Third-Party Support': ['other-servers', 'federation-spec'],
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
          'API Reference': ['api/apollo-subgraph', 'api/apollo-gateway'],
        },
      },
    },
  ],
};
