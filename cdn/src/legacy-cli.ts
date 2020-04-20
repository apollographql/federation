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
    { method, body }
  );

  if (response.ok) {
    return response;
  }

  if (response.status === 404) {
    throw new Error(
      `Couldn't find release for version ${version} on ${platform}`
    );
  }

  throw new Error(
    `Error when loading legacy CLI for ${version} on ${platform}. Error was ${response.statusText}`
  );
}
