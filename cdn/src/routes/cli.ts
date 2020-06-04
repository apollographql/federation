import setup from "@zeit/fetch-retry";
import { track } from "../segment";

const f = setup(fetch);

const GITHUB_RELEASE = "https://github.com/apollographql/rust/releases";

type CLIArgs = {
  platform: string; // "linux" | "windows" | "darwin";
  version?: string;
};

export async function handleCLI(
  { platform, version }: CLIArgs,
  event: FetchEvent
): Promise<Response> {
  if (platform && !version) {
    // fetch latest version number
    const response = await f(`${GITHUB_RELEASE}/latest`, {
      cf: { cacheEverything: true },
    });
    if (!response.ok) {
      throw new Error(
        `Error loading latest release for CLI at ${GITHUB_RELEASE}/latest`
      );
    }
    const parts = response.url.split("/");
    // /latest redirects to the actual latest release so we can pull the version
    version = parts[parts.length - 1].slice(1);
  }

  const { method, body } = event.request;
  // this only supports 64 bit architectures. I don't see us changing this but if we do, this will become gross
  const response = await f(
    `${GITHUB_RELEASE}/download/v${version}/ap-v${version}-${platform}.tar.gz`,
    { method, body, cf: { cacheEverything: true, cacheTtl: 2628000 } } as any
  );

  if (response.ok) {
    event.waitUntil(
      track({
        event: "CLI download",
        context: {
          app: "Apollo CLI",
          os: platform,
        },
        properties: {
          release_version: version,
        },
      })
    );
    return response;
  }

  if (response.status === 404) {
    return new Response(
      `Couldn't find release for version ${version} on ${platform} on GitHub Releases. This could be a problem with GitHub being offline or missing this version`,
      { status: 404 }
    );
  }

  return new Response(
    `Error when loading CLI for ${version} on ${platform} on GitHub releases. This could be because GitHub is down. The error we received from GitHub was ${response.statusText}`,
    { status: 500 }
  );
}
