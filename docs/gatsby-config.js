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
            'implementing-services',
            'gateway',
            'entities',
            'value-types',
            'errors',
            'metrics',
            'migrating-from-stitching',
            'other-servers',
            'federation-spec',
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
