<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/rocket1.svg" width="100%" height="144">

# Apollo CLI

> This is a new version of the Apollo CLI. If you are looking for the currently released and supported version, please go to the [docs page](https://www.apollographql.com/docs/devtools/cli/) or the [Apollo Tooling repository](https://github.com/apollographql/apollo-tooling). As this library matures, we will being pointing users to use the new CLI for certain features in a gradual roll out.

![Tests](https://github.com/apollographql/apollo-cli/workflows/Tests/badge.svg) ![Security audit](https://github.com/apollographql/apollo-cli/workflows/Security%20audit/badge.svg)

`apollo` is a command line interface designed for people who want to design, build, and manage a data graph. It is built to work seamless with the [Apollo Platform](https://www.apollographql.com/) and provide the core tooling for teams implementing a [principled data graph](https://principledgraphql.com/)

## Installation

The Apollo CLI can be installed in a few different ways depending on what is best for your environment.

### **For local development (aka on you machine)**

**Mac OS** or **Linux** users:

If you want a no dependency installation step, you can use the `curl` installer to get the CLI. Open your terminal and run the following command:

```
curl -sSL https://install.apollographql.workers.dev/cli | sh
```

This will download the latest release from GitHub and install the binary at your `/usr/local/bin` directory so it can be used globally for all projects.

The curl script accepts to variables if you want to customize the install. To change the destination you can set the `DESTDIR` variable to a new location (`curl -sSL https://install.apollographql.workers.dev/cli | DESTDIR=/opt/bin sh`). If you wan to install a specific version, you can set the `VERSION` variable in the same way as the `DESTDIR` (`curl -sSL https://install.apollographql.workers.dev/cli | VERSION=0.0.1 sh`)

> **Coming soon**: If you have `npm` already installed, and are comfortable with the node ecosystem, you can also install the library using `npm i -g @apollo/cli`. This will install a global version of the package which downloads the CLI just like the curl command does.

**Windows** users:

The curl command doesn’t currently support windows (though we want it to in the future). Right now the best way to get the latest CLI is to go to the [releases](<[https://github.com/apollographql/apollo-cli/releases/latest](https://github.com/apollographql/apollo-cli/releases/tag/v0.0.1)>) page and download the windows tarball. In the future, you will be able to install the CLI using chocolatey.

> **Coming soon**: If you have `npm` already installed, and are comfortable with the node ecosystem, you can also install the library using `npm i -g @apollo/cli`. This will install a global version of the package which downloads the CLI just like the curl command does.

**Verifying the Install**

If you want to verify the binary you have installed, each [release]([https://github.com/apollographql/apollo-cli/releases/latest) has a list of SHA256 values for each binary. To verify the CLI, you can run `sha256sum -b $(which apollo)` and compare the sha hash to the one next to your platform on the releases page. Note this requires you to have `sha256sum` installed to work.

### On your CI provider

The Apollo CLI is designed to be installed quickly and easily on common CI platforms. For build systems using **Mac OS** or **Linux**, the curl command above is the fastest way to get the CLI installed. For Windows, right now the best option is to manually copy the url of the latest release and unpack it on your machine. The `npm` route will be easier and faster and is coming soon!

## Updating the CLI

> Coming soon

The CLI will warn you periodically if it is falling behind from the latest builds. You can run the `apollo update` command to install the latest build for your system. Depending on how you installed the CLI, the update command will download a temporary build of the new version and attempt to replace the older one with the new one. If this fails, it will log an error and leave the old build behind for debugging purposes.

## Getting Started

The Apollo CLI is designed to make working with you data graph and code base as easy and powerful as possible. To get started you will want to connect the CLI to your Apollo account and then begin using it to do all sorts of wonderful things!

> Currently, the CLI doesn’t do anything 😅 but that will change very very rapidly as the team builds features into it. Each feature will be added below.

### Getting Help

The CLI has a top level help command which prints out all of the possible commands, an initial getting started guide, common flags, and the version of the command you are running. To view this, run the following command in your terminal:

`apollo help`

If you want to learn more about any commands, you can run `--help` as a flag for any subcommand. An example of this may look like `apollo login --help` (when it is built!) which will print out information on using the login command to link you Apollo account to your system.

## Additional Documentation

All information for the CLI or using the Apollo Platform is available on our [docs!](<[https://apollo.dev](https://apollo.dev/)>). The CLI docs for the current node version can be found [here](https://www.apollographql.com/docs/devtools/cli/) and as we being to ship features in this CLI, there will be a new docs page dedicated to using the new version and how to migrate from the older version.

## Contributing

If this project seems like something you want to which you want to contribute, first off **thank you**. We are so excited that you are excited about this project and we want to make sure contributing is a safe, fun, and fruitful experience for you. Please read our [code of conduct](https://www.apollographql.com/docs/community/code-of-conduct/) and then head on over to the [contributing guide](./Contributing.md) to learn how to work on this project. If you're just looking for how to add a command to the project, check out [this section](./Contributing.md#adding-a-new-command) of the contributing guide.

If you ever have any problems, questions, or ideas; the maintainers of this project are

- [@queerviolet](https://github.com/queerviolet)
- [@jbaxleyiii](https://github.com/jbaxleyiii)
- [@jakedawkins](https://github.com/jakedawkins)

<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/telescope.svg" width="100%" height="144">
