import setup from "@zeit/fetch-retry";
import { track } from "../segment";

const GITHUB_RELEASE =
  "https://github.com/apollographql/apollo-tooling/releases";

type LegacyCLIArgs = {
  platform: string;
  version: string;
};

export async function handleLegacyCLI(
  { platform, version }: LegacyCLIArgs,
  event: FetchEvent
): Promise<Response> {
  // this only supports 64 bit architectures. I don't see us changing this but if we do, this will become gross
  const response = await setup(fetch)(
    `${GITHUB_RELEASE}/download/apollo@${version}/apollo-v${version}-darwin-x64.tar.gz`,
    { cf: { cacheEverything: true, cacheTtl: 2628000 } } as any // cloudflare types doesn't include cacheTtl
  );

  if (response.ok) {
    event.waitUntil(
      track({
        event: "Legacy CLI download",
        context: {
          app: "Apollo iOS",
          os: "darwin",
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
    `Error when loading the legacy CLI for ${version} on ${platform} on GitHub releases. This could be because GitHub is down. The error we received from GitHub was ${response.statusText}`,
    { status: 500 }
  );
}
