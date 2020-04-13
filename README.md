# [Experimental] Apollo CLI


This project is an early experiment at replacing the functionality of the current apollo-tooling repo with a new, and much better, CLI / LSP experience. It is being written in rust to have maximum portability and is aimed at a new command structure, config / onboarding experience, etc. Its greenfield ;)

## Quick Start
If you have all of the dependencies setup and are ready to get right into contributing, run the following command after cloneing the repo:

```sh
cargo run
```

## Contributing

This is very early days for this project. It is setup as a multi-crate rust project. To get started you need to have the rust toolchain installed. The best way to do this is to visit [the amazing rust site](https://www.rust-lang.org/learn/get-started) and follow their install instructions.

To ensure you are ready, you should be able to run this:

```sh
cargo --version
```

and get something back that looks like this:

```sh
cargo 1.42.0 (86334295e 2020-01-31)
```

### Running the project
To run the project locally, you can use `cargo` to build and exexecute the bin of the `apollo` crate.

```
cargo run
```

will install your packages, build the librar(ies), and run the program.

### Testing the project
Rust has great built-in test tooling. You can write tests in-line or under the tests folder for each crate. Tests under the `tests` folder should be integration whereas inline should be unit tests (as I understand from the conventions). You can run `cargo test` to test all of the crates at once.

### Opening PRs
The GitHub repo is setup to run a linting and test suite on each push. This uses GitHub actions and you should get full feedback from them quickly thanks to some caching work setup.

Please ask for reviews from @queerviolet, @jakedawkins, and @jbaxleyiii for all PRs at this stage of the project.

## Cutting releases
Right now releases are run via tags pushed to GitHub. To cut a release, create a new tag via git (`git tag -d v0.0.2`) and make sure it has a `v` in front of the version number. This will increment the build and cut a release to build binaries of the CLI and store them on the GitHub release tab. 

> In the future this will be built out more with an approval flow and automatic distribution to `npm` and `cargo` as well as an install by curl command


## Code of Conduct
This project, and all under the `apollographql` org follow the [Apollo Code of Conduct](https://www.apollographql.com/docs/community/code-of-conduct/). We welcome all contributors but it is vital that this is a safe and welcoming space to others. Please read the code of conduct :)

## Maintainers
- [@queerviolet](https://github.com/queerviolet)
- [@jbaxleyiii](https://github.com/jbaxleyiii)
- [@jakedawkins](https://github.com/jakedawkins)
