<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/satellite2.svg" width="100%" height="144">

# CLI CDN

This folder contains the code that powers the CDN for the Apollo CLI. Since the CLI supports installation through a variety of means, we have a central endpoint at which to direct installation packages. This CDN uses [cloudflare workers](https://workers.cloudflare.com/) to serve a global edge cache for installers.

There are two main parts of which to be aware:

* __[Worker script](./src/)__: This folder contains the TypeScript source code that is compiled and bundled into a worker script
* __[Installer](./public/cli/install.sh)__: This file is the main installer script that people run when they `curl` the proxy to get the CLI

### Worker
The worker is a simple routing application that has a few simple routes. It is consumed by the [`installer`](./public/cli/install.sh) and will eventually be used by a variety of projects including the Apollo iOS project, the npm wrapper, and distributions to other package installers (i.e. `homebrew`). The routes are a mixture of static and dynamic routes:

* __/__: This serves up a simple instructions page in case anyone hits the app manually
* __404__: There is a 404 page which matches the index.html to help people who accidently landed on the worker
* __/:project__: This route serves the default `install.sh` for a given project. Currently this is only the new CLI, but more could be added here in the future
* __/:project/:platform__: This route fetches the latest release from GitHub and serves back a tarball suited for the platform requested (i.e. darwin, linux, or windows currently)
* __/:project/:platform/:version__: Used by installers who want to install a specific version (such as the iOS or npm installers), this route is a direct proxy to the GitHub Releases storage for the CLI

The worker is deployed to Cloudflare's global worker runtime and uses their `KV` cache to cache static assets. It reads the `ETAG` and other cache headers of responses from GitHub Releases to cache tarballs all around the globe for faster and more robust uptimes.

### Installer
There are two installers supported by the CDN. First is the nix `install.sh` installer for the new CLI which is installed via a `curl` command. This installer is designed to be run on users machines __and__ on CI environments to support usage of the Apollo CLI on those machines with a single __copyable__ command.

The nix installer only supports `linux` and `darwin` architectures.

For installation on windows we provide a powershell installer at `windows.sh`
> This file is listed as a .sh file even though it really is ps1 due to quirk in Cloudflare workers not resovling ps1 urls?

To install on windows, people can run the following:
```ps1
iwr 'http://install.apollographql.com/windows.sh' | iex
```

## Local Development

Local development of the worker is done using the [`wrangler`](https://github.com/cloudflare/wrangler) toolchain. To run the project locally you will first need to install the projects depedencies:

```sh
npm i
```

After you have these installed, you can run the project using the following command:

```sh
npm start
```

This will run `wrangler dev` which will serve the compiled worker at [`http://localhost:8787`](http://localhost:8787).

> Note: Local development without the cloudflare account_id and being logged in will not serve the static assets locally. It will work for proxying to GitHub though.

## Testing
This project has two main test suites; one for the worker and one for the installer script. The worker is tested with [`jest`](https://jestjs.io/) and runs in a mocked worker environment. To run the worker test suite you can run `npm test` or `npm run test:worker:watch` if you want to run it in watch mode.

The installer script is tested using the [`bats`](https://github.com/sstephenson/bats) testing framework for shell script testing. To run these you can run `npm test:shell` or `npm run test:shell:watch` if you want to run it in watch mode.

> Note that the watch script for the installer requires having `entr` installed. `brew install entr` if you are missing it.

The CI will take coverage reports for both test suites to ensure a well tested project. PRs will report back coverage test changes with links to a viewer to see missing lines.

## Releases

Releasing a new build of the production worker is managed through GitHub actions. When a PR is merged to master that has changes to the `./cdn` project, it will deploy a new verion of the worker to cloudflare automatically. This will create a GitHub deployment tagged to the commit so we can easily reference back to deployed commits.

If you want to deploy to either the `staging` or `dev` stacks, you will first need to login to the [Cloudflare Dashboard](https://dash.cloudflare.com/login). The first step will be to authenticate `wrangler` using the `wrangler config` command. Once that is done, go back to the dashboard and then click on the Workers link to go to the workers dashboard. This will have an `account_id` that you can copy into you clipboard.

Deploying is done using the `wrangler publish` command along with your `account_id`:

```sh
# Deploy to staging
CF_ACCOUNT_ID=<account_id> wranger publish --env staging

# Deploy to dev
CF_ACCOUNT_ID=<account_id> wranger publish --env dev
```

The production worker can be deployed like this as well in case of an emergency or critical hotfix.

## Runbook

The worker is instrumented with [Sentry](https://sentry.io) alerting, is monitored by [Datadog](https://www.datadoghq.com/), and is wired up to [PagerDuty](https://pagerduty.com). The current on call team is comprised of:

* [@jbaxleyiii](https://github.com/jbaxleyiii)
* [@abernix](https://github.com/abernix)
* [@hwillson](https://github.com/hwillson)

The CDN is connected to our [status page](https://status.apollographql.com) with both uptime and latency reporting in place for our users.

### Potential Problems
> As problems arise, please add instructions here of what to do if there is a problem with the CDN

__404 when installing a package__:

If there is an elevated number of `404`s happening check the `Releases` tab of the `apollo-cli` or the `apollo-tooling` (for legacy CLI) to ensure that the release in question (typically latest) has all of its tarballs for each platform. There should be three tarballs present. If there aren't, you will need to cut a new release or manually build the tarballs. You can follow the steps in the release CI job [here](../.github/workflows/release.yml) but it is often easier to cut a new release using the [release steps](../CONTRIBUTING.md#Releasing-the-CLI).

<img src="https://raw.githubusercontent.com/apollographql/space-kit/master/src/illustrations/svgs/moon.svg" width="100%" height="144">
