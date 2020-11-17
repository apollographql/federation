const themeOptions = require('gatsby-theme-apollo-docs/theme-options');

module.exports = {
  pathPrefix: '/docs/federation',
  plugins: [
    {
      resolve: 'gatsby-theme-apollo-docs',
      options: {
        ...themeOptions,
        root: __dirname,
        subtitle: 'Apollo Federation',
        description: 'A guide to using Apollo Federation',
        githubRepo: 'apollographql/federation',
        sidebarCategories: {
          null: [
            'index',
          ],
          'Core Concepts': [
            'implementing-services',
            'gateway',
            'entities',
            'value-types',
            'migrating-from-stitching',
          ],
          'Managed Federation': [
            'managed-federation/overview',
            'managed-federation/setup',
            'managed-federation/advanced-topics',
          ],
          'Debugging': [
            'errors',
            'metrics',
          ],
          'Third-Party Support': [
            'other-servers',
            'federation-spec',
            'specs/using',
            'specs/csdl',
          ],
          'API Reference': [
            'api/apollo-federation',
            'api/apollo-gateway',
          ],
        },
      },
    },
  ],
};
