# Apollo Rust

> This is a monorepo containing several projects that are being rewritten in Rust
> at Apollo.

## Projects

- ### [🌐 CDN](https://github.com/apollographql/rust/tree/main/cdn)

	This project contains the code that aids in the installation of the CLI.
	It uses [Cloudflare Workers] to cache [Github Releases] of the CLI.

	[Cloudflare Workers]: https://workers.cloudflare.com/
	[Github Releases]: https://github.com/apollographql/rust/releases

- ### [🚀 CLI](https://github.com/apollographql/rust/tree/main/cli)

	`ap` is a command line interface designed for people who want to design,
	 build, and manage a data graph.

- ### [🍽️ GraphQL Parser](https://github.com/apollographql/rust/tree/main/graphql-parser)

	A parser, formatter and AST for graphql query and schema definition language.

- ### [🤓 QueryPlanner](https://github.com/apollographql/rust/tree/main/query-planner)

	TBD
