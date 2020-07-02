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

## Contributing

All of the projects in this repo are in the very early iteration stages, and therefore
not in a great place for external contributions. That being said, if you have an idea or
question feel free to [file an issue]. 

[file an issue]: https://github.com/apollographql/rust/issues/new/choose

### License

All projects within this repo are licensed under the MIT license
([LICENSE] or  http://opensource.org/licenses/MIT).

[LICENSE]: https://github.com/apollographql/rust/blob/main/LICENSE

### Contributor License Agreement (CLA)

In order to have a PR merged to any of these proejcts, you must sign a Contributor
License Agreement, or CLA. There is a check that runs on every PR; if you haven't
signed you will be prompted to in a PR comment.

You can preview the text of the agreement [here][CLA].

[CLA]: https://contribute.apollographql.com/
