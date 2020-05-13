const GITHUB_RELEASE =
  "https://github.com/apollographql/apollo-tooling/releases";

type LegacyCLIArgs = {
  platform: "darwin";
  version: string;
};

export async function handleLegacyCLI(
  { platform, version }: LegacyCLIArgs,
  event: FetchEvent
): Promise<Response> {
  const { method, body } = event.request;
  // this only supports 64 bit architectures. I don't see us changing this but if we do, this will become gross
  const response = await fetch(
    `${GITHUB_RELEASE}/download/apollo@${version}/apollo-v${version}-darwin-x64.tar.gz`,
    { method, body, cf: { cacheEverything: true, cacheTtl: 3600 } } as any // cloudflare types doesn't include cacheTtl
  );

  if (response.ok) {
    return response;
  }

  if (response.status === 404) {
    throw new Error(
      `Couldn't find release for version ${version} on ${platform} on GitHub Releases. This could be a problem with GitHub being offline or missing this version`
    );
  }

  throw new Error(
    `Error when loading the legacy CLI for ${version} on ${platform} on GitHub releases. This could be because GitHub is down. The error we received from GitHub was ${response.statusText}`
  );
}
