const themeOptions = require('gatsby-theme-apollo-docs/theme-options');

module.exports = {
  plugins: [
    {
      resolve: 'gatsby-theme-apollo-docs',
      options: {
        ...themeOptions,
        root: __dirname,
        pathPrefix: '/docs/federation',
        algoliaIndexName: 'federation',
        algoliaFilters: ['docset:federation', ['docset:server', 'docset:rover', 'docset:studio']],
        subtitle: 'Apollo Federation',
        description: 'A guide to using Apollo Federation',
        githubRepo: 'apollographql/federation',
        sidebarCategories: {
          null: ['index'],
          Quickstart: ['quickstart', 'quickstart-pt-2', 'quickstart-pt-3'],
          'Core Concepts': [
            'subgraphs',
            'gateway',
            'entities',
            'value-types',
            'migrating-from-stitching',
          ],
          'Managed Federation': [
            'managed-federation/overview',
            'managed-federation/setup',
            'managed-federation/federated-schema-checks',
            'managed-federation/deployment',
            'managed-federation/error-reporting',
            '[Studio features](https://www.apollographql.com/docs/studio/federated-graphs/)',
          ],
          'Enterprise Guide': [
            'enterprise-guide/introduction',
            'enterprise-guide/graphql-consolidation',
            'enterprise-guide/federated-schema-design',
            'enterprise-guide/graph-administration',
            'enterprise-guide/graph-security',
            'enterprise-guide/change-management',
            'enterprise-guide/federation-case-studies',
            'enterprise-guide/additional-resources',
          ],
          'Performance': [
            'performance/caching',
            'performance/monitoring',
          ],
          'Debugging & Metrics': [
            'errors',
            'metrics',
            'opentelemetry',
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
