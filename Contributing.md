<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/astronaut1.svg" width="100%" height="144">

# Apollo Contributor Guide

> If this is your first time or 100th time contributing to a project, the [Open Source Guide](https://opensource.guide/how-to-contribute/) is a fantastic place to learn about Open Source Software (OSS) and how to get involed.

Excited about Apollo and want to make it better? We’re excited too!

Apollo is a community of developers just like you, striving to create the best tools and libraries around GraphQL. We welcome anyone who wants to contribute or provide constructive feedback, no matter the age or level of experience. If you want to help but don't know where to start, let us know, and we'll find something for you.

Oh, and if you haven't already, join the [Apollo Spectrum community](https://spectrum.chat/apollo).

Here are some ways to contribute to the project, from easiest to most difficult:

- [Reporting bugs](#reporting-bugs)
- [Improving the documentation](#improving-the-documentation)
- [Responding to issues](#responding-to-issues)
- [Small bug fixes](#small-bug-fixes)
- [Suggesting features](#suggesting-features)
- [Big changes or new features](#big-changes-or-new-features)

If you are looking to get started working in the repository right away, jump ahead to the [developing the CLI](#developing-the-cli) below.

## Issues

### Reporting bugs

If you encounter a bug, please file an issue on this GitHub repository. If an issue you have is already reported, please add additional information or add a 👍 reaction to indicate your agreement.

While we will try to be as helpful as we can on any issue reported, please include the following to maximize the chances of a quick fix:

1. **Intended outcome:** What you were trying to accomplish when the bug occurred, and as much code as possible related to the source of the problem.
2. **Actual outcome:** A description of what actually happened, including a screenshot or copy-paste of any related error messages, logs, or other output that might be related. Please avoid non-specific phrases like “didn’t work” or “broke”. Including the version of the CLI and what platform you are using is really helpful.
3. **How to reproduce the issue:** Instructions for how the issue can be reproduced by a maintainer or contributor. Be as specific as possible, and only mention what is necessary to reproduce the bug.

Creating a good reproduction really helps contributors investigate and resolve your issue quickly. In many cases, the act of creating a minimal reproduction illuminates that the source of the bug was somewhere outside the library in question, saving time and effort for everyone.

### Improving the documentation

Improving the documentation, examples, and other open source content can be the easiest, and one of the most important, way to contribute to the library. If you see a piece of content that can be better, open a PR with an improvement, no matter how small! If you would like to suggest a big change or major rewrite, we’d love to hear your ideas! Please open a feature request for discussion before writing the PR.

### Responding to issues

In addition to reporting issues, a great way to contribute to Apollo is to respond to other peoples' issues and try to identify the problem or help them work around it. If you’re interested in taking a more active role in this process, please go ahead and respond to issues. And don't forget to say "Hi" in the [Apollo Spectrum community](https://spectrum.chat/apollo)!

### Small bug fixes

For a small bug fix change (less than ~20 lines of code changed), feel free to open a pull request. We’ll try to merge it as fast as possible and ideally publish a new release on the same day. The only requirement is, make sure you also add a test that verifies the bug you are trying to fix.

### Suggesting features

Most of the features in Apollo Client came from suggestions by you, the community! We welcome any ideas about how to make Apollo better for your use case. Open up a new feature request / discussion issue with your details.

## Big Changes or New Features

For significant changes to a repository, it’s important to settle on a design before starting on the implementation. This way, we can make sure that major improvements get the care and attention they deserve. Since big changes can be risky and might not always get merged, it’s good to reduce the amount of possible wasted effort by agreeing on an implementation design/plan first.

1. **Open an issue.** Open an issue about your bug or feature request in this repo.
2. **Reach consensus.** Some contributors and community members should reach an agreement that this feature or bug is important, and that someone should work on implementing or fixing it.
3. **Agree on intended behavior.** On the issue, reach an agreement about the desired behavior. In the case of a bug fix, it should be clear what it means for the bug to be fixed, and in the case of a feature, it should be clear what it will be like for developers to use the new feature.
4. **Agree on implementation plan.** Write a plan for how this feature or bug fix should be implemented. What modules need to be added or rewritten? Should this be one pull request or multiple incremental improvements? Who is going to do each part?
5. **Submit PR.** In the case where multiple dependent patches need to be made to implement the change, only submit one at a time. Otherwise, the others might get stale while the first is reviewed and merged. Make sure to avoid “while we’re here” type changes - if something isn’t relevant to the improvement at hand, it should be in a separate PR; this especially includes code style changes of unrelated code.
6. **Review.** At least one core contributor should sign off on the change before it’s merged. Look at the “code review” section below to learn about factors are important in the code review. If you want to expedite the code being merged, try to review your own code first!
7. **Merge and release!**

### Code review guidelines

It’s important that every piece of code in Apollo packages is reviewed by at least one core contributor familiar with that codebase. Here are some things we look for:

1. **Required CI checks pass.** This is a prerequisite for the review, and it is the PR author's responsibility. As long as the tests don’t pass, the PR won't get reviewed. To learn more about our CI pipeline, read about it [below](#pipelines)
2. **Simplicity.** Is this the simplest way to achieve the intended goal? If there are too many files, redundant functions, or complex lines of code, suggest a simpler way to do the same thing. In particular, avoid implementing an overly general solution when a simple, small, and pragmatic fix will do.
3. **Testing.** Do the tests ensure this code won’t break when other stuff changes around it? When it does break, will the tests added help us identify which part of the library has the problem? Did we cover an appropriate set of edge cases? Look at the test coverage report if there is one. Are all significant code paths in the new code exercised at least once?
4. **No unnecessary or unrelated changes.** PRs shouldn’t come with random formatting changes, especially in unrelated parts of the code. If there is some refactoring that needs to be done, it should be in a separate PR from a bug fix or feature, if possible.
5. **Code has appropriate comments.** Code should be commented describing the problem it is solving, not just the technical implementation.

## Developing the CLI

### Quick Start

If you have all of the dependencies setup and are ready to get right into contributing, run the following command after cloneing the repo:

```
cargo run -- help
```

This step will install of the dependencies and print out the help command from the CLI. To run develop commands and test them out locally, you can use the `cargo run` command and pass commands and headers like this:

```
cargo run -- <command name> --<flag>
```

Cargo will proxy your commands and flags to the built CLI project.

### Deep dive

**Prerequisites:**
This project is written in Rust and setup as a multi crate (aka package) project to allow us to share common code across multiple packages. To get started you need to have the Rust toolchain installed. The best way to do this is to visit [the amazing rust site](https://www.rust-lang.org/learn/get-started) and follow their install instructions.

To ensure you are ready, you should be able to run this:

`cargo --version`

and get something back that looks like this:

`cargo 1.42.0 (86334295e 2020-01-31)`

**Testing the project**
Rust has great built-in test tooling. You can write tests in-line or under the tests folder for each crate. Tests under the `tests` folder should be integration whereas inline should be unit tests. You can run `cargo test` to test all of the crates at once. For more info on how to write tests, look to similar parts of the codebase or read the [rustlang.org article](https://doc.rust-lang.org/book/ch11-00-testing.html) on testing

> If you have your editor setup with the Rust extension, you can click the codelens “Test” command to run individual tests right from you editor! How cool is that?!

**Opening a Pull Request**
Once you have fixed a bug, created the next great feature, or improved the project in some other way it is time to open a pull request! To learn more about how to do this, follow [this great guide](https://opensource.guide/how-to-contribute/#opening-a-pull-request). When you open a PR, the pipeline steps will run to ensure the changes will work for users of this library. To learn more about the pipeline, keep reading below!

## Adding a new command

Adding a new command to the Apollo CLI is easy! Most of the work can even be copied from existing commands or from the following example for a simple `do-a-thing` command 🎉

1. Add a struct for it in `commands/mod.rs`. The kebab-case version of the name of this struct and its fields will be your command and flags' names. This struct uses `StructOpt` to build out the names, options, and docs for the CLI. Check out existing commands or the [StructOpt documentation](https://docs.rs/structopt/0.3.13/structopt/) for explantion and usage of StructOpt's many features.

```rust
// commands/mod.rs

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
/// 🎉 This command will do a thing!!
pub struct DoAThing {
    #[structopt(long)]
    /// this flag, if not passed, or passed with `false` will panic the command
    pub test_flag: bool,
}
```

2. Add it to the `Apollo` enum for it in `commands/mod.rs`.

```rust
// commands/mod.rs

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
/// The [Experimental] Apollo CLI, for supporting all your graphql needs :)
pub enum Apollo {
    ...
    /// my command does a thing!
    DoAThing(DoAThing),
}
```

3. Add a module for it in `commands/`. If your command is big and needs multiple files, feel free to give it a directory inside commands. The module will `impl Command for <your-command>`

```rust
// commands/do_a_thing.rs

use crate::commands::Command;
use crate::commands::DoAThing;

impl Command for DoAThing {
  fn run(&self) {
    // implementation here :)
    if self.test_flag == false {
      panic!("aah!");
    }
  }
}
```

4. Add a case for it to the `impl Command for Apollo`, again in `commands/mod.rs`.

```rust
// commands/mod.rs

impl Command for Apollo {
    fn run(&self) {
        match self {
          ...
          Apollo::DoAThing(cmd) => cmd.run(),
        }
    }
}
```

5. Enjoy! Run your command with `cargo run do-a-thing` (the kebab-case version of the struct name).

## Building out command logic

The `ap` CLI aims to provide a stable, consistent, and transparent tool for developers to use. To accomplish this, we recommend following a few standard conventions and tools that have been built into the framework.

### Logging

One critical component in any tool is proper and clear logging. We leverage a crate called `env_logger` to build out a custom logging utility that can be used by any command to provide users with controllable, flag-configurable logging.

To support most logging use cases, there are 5 macros provided: `error!`, `warn!`, `info!` and `debug!`, where `error!` represents the highest-priority log messages and `debug!` the lowest. `error!` and `warn!` print to `stderr` whereas `info` and `debug` print to `stdout`. All of these macros accept format strings, similar to `println!`, and their output is prefixed with their message type like so:

```
[ERROR] this is an error message
[WARN]  this is a warning message
[INFO] this is an info message
[DEBUG] this is a debug message
[TRACE] this is a trace message
```

**`APOLLO_LOG_LEVEL`**

Setting the `APOLLO_LOG_LEVEL` env variable controls what levels of messages are printed. For example, `APOLLO_LOG_LEVEL=warn` will only print messages with precedence of `warn` or higher. There are 5 levels of messages: `error`, `warn`, `info`, `debug`, and `trace`, where `error` has the highest precedence and `trace` has the lowest. If you want to see `trace` messages, you must use the env variable, since traces are expected to be extremely loud.

The env variable can also be used to filter messages by module. For example, if you only wanted print messages from the `commands::login` module of a `info` or higher precedence, you could set the `APOLLO_LOG_LEVEL=apollo_cli::commands::login=info`.

**`--verbose` and `--quiet`**

There are two flags that are used to control log levels, `--verbose` and `--quiet`, and they can be used with any command. `--verbose` prints messages with a `verbose` or higher precedence (ignoring `trace` level messages). `--quiet` only prints `error` messages (since they are breaking errors and no usable output is expected).

Flags will take precedence over any `APOLLO_LOG_LEVEL` env variable, and trying to use both at the same time will result in a warning.

## Pipelines

This project uses GitHub Actions to run a continuous integration and delivery pipeline. Every code change will be run against a few steps to help keep the project running at its peak ability

- **CLA Check**: If you haven’t signed the Apollo CLA, a bot will comment on your PR asking you to do this
- **Tests**: The CI will run the `cargo test` command across there different architectures (Mac OS, Linux, and Windows). If your build fails on a platform that can’t test on don’t worry! The team will be able to help you out as we run all three platforms to make sure everyone has a great experience.
- **Coverage**: This project runs a job to collect information on how much of the library has been tested using code coverage tools. This is a WIP but you may see a status check related to how you have improved (or lowered 😢) the amount covered. Don’t worry, it happens to all of us and we are here to help out!
- **Build**: Each PR will build a set of binaries that can be installed and used like the full release. In fact, it uses most of the same process as our release setup! Currently this is limited to only people with write access to the repo but we are working on a way to make this easy for anyone to use.

After you have opened your PR and all of the status checks are passing, please assign it to one of the maintainers (found in the bottom of [the readme](./Readme.md#contributing) who will review it and give feedback.

## Releasing the CLI

The Apollo CLI is designed and built to be easily distributed across a number of environments and platforms. Cutting new releases is a critical part of this process to get feedback from our community and continue to deliver value to them. The release process is entirely automated so anyone with write access can create a release and get it distributed quickly and easily.

### Checklist

Before you create a release there are a couple of steps that aren’t yet automated that we ask you to do:

1. **Update the [Changelog](./Changelog.md):** The Changelog is used to create the notes of the GitHub release and, more importantly, it is an important tool to help maintainers and users alike understand how the project has changed over time. This project uses [Keep a Changelog](`https://keepachangelog.com/en/1.0.0/) to make a legible and helpful log
2. **Bump the package versions**: The main [cargo](./cli/Cargo.toml] file should be bumped to a new version. The `npm` package (once added 😅) should also be bumped until it is automated as part of the release cycle.

After you have done the above, it is time to cut a release!

### Cutting a Release

Creating a new release is done using git tags. This project supports both “preleases” and normal releases with the same process. To cut a release copy the version of the CLI from the [Cargo.toml](./cli/Cargo.toml) and run the following command:

```
git tag -a <version copied from Cargo.toml> -m "<Message about your release>"
```

After you have created the tag, run `git push origin --tags` to update GitHub and kickoff the build process. When it is done a new GitHub release will be created with the changelog entry matching that version included as well as a list of SHA256 hashes of the binaries to be used to verify downloads.

**Prerelease builds**
Cutting an `alpha` or `beta` follows the exact same step with the only change coming from the name of the tag. To make a versioned alpha you would run `git tag -a <version copied>-alpha.<number of alpha build (i.e 1) -m "<Message about release>"` This will tell GitHub to create a **prerelease** instead of updating the latest release that everyone gets when using the `curl` installer. That is it!

If you have any problems with this release process, please create an issue and tag [@jbaxleyiii](https://github.com/jbaxleyiii)

<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/observatory.svg" width="100%" height="144">
