<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/rocket1.svg" width="100%" height="144">

# Apollo CLI

> This is a new version of the Apollo CLI. If you are looking for the currently released and supported version, please go to the [docs page](https://www.apollographql.com/docs/devtools/cli/) or the [Apollo Tooling repository](https://github.com/apollographql/apollo-tooling). As this library matures, we will being pointing users to use the new CLI for certain features in a gradual roll out.

[![Tests](https://github.com/apollographql/rust/workflows/Tests/badge.svg)](https://github.com/apollographql/rust/actions?query=workflow%3ATests)
[![Security audit](https://github.com/apollographql/rust/workflows/Security%20audit/badge.svg)](https://github.com/apollographql/rust/actions?query=workflow%3A%22Security+audit%22)

`ap` is a command line interface designed for people who want to design, build, and manage a data graph. It is built to work seamless with the [Apollo Platform](https://www.apollographql.com/) and provide the core tooling for teams implementing a [principled data graph](https://principledgraphql.com/)

## Installation

The Apollo CLI can be installed in a few different ways depending on what is best for your environment.

### **For local development (aka on you machine)**

**Mac OS** or **Linux** users:

If you want a no dependency installation step, you can use the `curl` installer to get the CLI. Open your terminal and run the following command:

```
curl -sSL https://install.apollographql.com/ | sh
```

This will download the latest release from GitHub and install the binary at your `/usr/local/bin` directory so it can be used globally for all projects.

The curl script accepts to variables if you want to customize the install. To change the destination you can set the `DESTDIR` variable to a new location (`curl -sSL https://install.apollographql.com/ | DESTDIR=/opt/bin sh`). If you wan to install a specific version, you can set the `VERSION` variable in the same way as the `DESTDIR` (`curl -sSL https://install.apollographql.com/ | VERSION=0.0.1 sh`)

**Windows** users:

Make sure [PowerShell 5](https://aka.ms/wmf5download) (or later, include [PowerShell Core](https://docs.microsoft.com/en-us/powershell/scripting/install/installing-powershell-core-on-windows?view=powershell-6)) and [].NET Framework 4.5](https://www.microsoft.com/net/download) (or later) are installed. Then run:

```ps1
iwr 'https://install.apollographql.com/windows.sh' | iex
```

> Note: if you get an error you might need to change the execution policy (i.e. enable Powershell) with

```ps1
Set-ExecutionPolicy RemoteSigned -scope CurrentUser
```

**Verifying the Install**

If you want to verify the binary you have installed, each [release]([https://github.com/apollographql/rust/releases/latest) has a list of SHA256 values for each binary. To verify the CLI, you can run `sha256sum -b $(which apollo)` and compare the sha hash to the one next to your platform on the releases page. Note this requires you to have `sha256sum` installed to work.

### On your CI provider

The Apollo CLI is designed to be installed quickly and easily on common CI platforms. For build systems using **Mac OS** or **Linux**, the curl command above is the fastest way to get the CLI installed. For Windows, the `iwr` command above should get you up and running right away!

## Updating the CLI

> Coming soon

The CLI will warn you periodically if it is falling behind from the latest builds. You can run the `ap update` command to install the latest build for your system. Depending on how you installed the CLI, the update command will download a temporary build of the new version and attempt to replace the older one with the new one. If this fails, it will log an error and leave the old build behind for debugging purposes.

## Getting Started

The Apollo CLI is designed to make working with you data graph and code base as easy and powerful as possible. To get started you will want to connect the CLI to your Apollo account and then begin using it to do all sorts of wonderful things!

> Currently, the CLI doesn’t do anything 😅 but that will change very very rapidly as the team builds features into it. Each feature will be added below.

### Getting Help

The CLI has a top level help command which prints out all of the possible commands, an initial getting started guide, common flags, and the version of the command you are running. To view this, run the following command in your terminal:

`ap help`

If you want to learn more about any commands, you can run `--help` as a flag for any subcommand. An example of this may look like `ap login --help` (when it is built!) which will print out information on using the login command to link you Apollo account to your system. 

## Additional Documentation

All information for the CLI or using the Apollo Platform is available on our [docs!](<[https://apollo.dev](https://apollo.dev/)>). The CLI docs for the current node version can be found [here](https://www.apollographql.com/docs/devtools/cli/) and as we being to ship features in this CLI, there will be a new docs page dedicated to using the new version and how to migrate from the older version.

## Contributing

If this project seems like something you want to which you want to contribute, first off **thank you**. We are so excited that you are excited about this project and we want to make sure contributing is a safe, fun, and fruitful experience for you. Please read our [code of conduct](https://www.apollographql.com/docs/community/code-of-conduct/) and then head on over to the [contributing guide](./CONTRIBUTING.md) to learn how to work on this project. If you're just looking for how to add a command to the project, check out [this section](./CONTRIBUTING.md#adding-a-new-command) of the contributing guide.

If you ever have any problems, questions, or ideas; the maintainers of this project are

- [@queerviolet](https://github.com/queerviolet)
- [@jbaxleyiii](https://github.com/jbaxleyiii)
- [@jakedawkins](https://github.com/jakedawkins)

<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/telescope.svg" width="100%" height="144">
