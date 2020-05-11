# Changelog for the Apollo CLI

> for libraries or other packages, see their directories

All notable changes to this project will be documented in this file. __This file is used to generate release information__

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2020-05-11
### Added
- Added hidden `print` command for printing out GraphQL Documents when debugging
- Added new logger and error handling internally:

Setting the `APOLLO_LOG_LEVEL` env variable controls what levels of messages are printed. For example, `APOLLO_LOG_LEVEL=warn` will only print messages with precedence of `warn` or higher. There are 5 levels of messages: `error`, `warn`, `info`, `debug`, and `trace`, where `error` has the highest precedence and `trace` has the lowest. If you want to see `trace` messages, you must use the env variable, since traces are expected to be extremely loud.

The env variable can also be used to filter messages by module. For example, if you only wanted print messages from the `commands::login` module of a `info` or higher precedence, you could set the `APOLLO_LOG_LEVEL=apollo_cli::commands::login=info`.

**`--verbose` and `--quiet`**

There are two flags that are used to control log levels, `--verbose` and `--quiet`, and they can be used with any command. `--verbose` prints messages with a `verbose` or higher precedence (ignoring `trace` level messages). `--quiet` only prints `error` messages (since they are breaking errors and no usable output is expected).

Flags will take precedence over any `APOLLO_LOG_LEVEL` env variable, and trying to use both at the same time will result in a warning.

### Breaking
- moved installation from /usr/local/bin to ~/.apollo/bin with setup of profile

## [0.0.2] - 2020-04-23
### Added
- Setup new basic structure for commands including unimplemented `login` command

### Breaking
- Renamed the CLI from `apollo` to `ap` while there are still two Apollo CLIs in use by teams

## [0.0.1] - 2020-04-11
### Added
- Automated distribution and release pipeline
