import {
  getAssetFromKV,
  mapRequestToAsset,
} from "@cloudflare/kv-asset-handler";
import { log } from './sentry'

const GITHUB_RELEASE = "https://github.com/apollographql/apollo-cli/releases";

enum Product {
  cli = "cli",
}

type CLIArgs = {
  platform: "linux" | "windows" | "darwin";
  version?: string;
};

type PossiblePaths = [undefined, Product?, CLIArgs["platform"]?, string?];

export async function handleRequest(event: FetchEvent): Promise<Response> {
  try {
    const url = new URL(event.request.url);
    const [, product, platform, version] = url.pathname.split(
      "/"
    ) as PossiblePaths;

    /*

      Route table:
        - /:product -> Install script for the product (i.e.) curl https://install.apollographql.com/cli | sh
        - /:product/:platform -> latest build for a given architecture
        - /:product/:platform/:version -> specific build for a given architecture

    */
    switch (product) {
      case "cli":
        // /:product
        if (!platform) {
          return await serveStatic(event, "/install.sh");
        }
        // /:product/:platform
        // /:product/:platform/:version
        return await handleCLI({ platform, version }, event);
      default:
        // handle static assets
        return await serveStatic(event);
    }
  } catch (e) {
    event.waitUntil(log(e, event.request));
    return Promise.resolve(
      new Response(e.message || e.toString(), { status: 500 })
    );
  }
}

async function handleCLI(
  { platform, version }: CLIArgs,
  event: FetchEvent
): Promise<Response> {
  if (platform && !version) {
    // fetch latest version number
    const response = await fetch(`${GITHUB_RELEASE}/latest`);
    if (!response.ok) {
      throw new Error(
        `Error loading latest release for CLI at ${GITHUB_RELEASE}/latest`
      );
    }
    const parts = response.url.split("/");
    version = parts[parts.length - 1].slice(1);
  }

  const { method, body } = event.request;
  // this only supports 64 bit architectures. I don't see us changing this but if we do, this will become gross
  const response = await fetch(
    `${GITHUB_RELEASE}/download/v${version}/apollo-v${version}-x86_64-${platform}.tar.gz`,
    { method, body }
  );

  if (response.ok) {
    return response;
  }

  if (response.status === 404) {
    throw new Error(`Couldn't find release for version ${version} on ${platform}`);
  }

  throw new Error(`Error when loading CLI for ${version} on ${platform}. Error was ${response.body}`);
}

async function serveStatic(event: FetchEvent, path: string = "") {
  function customKeyModifier(req: Request): Request {
    let url = req.url;
    return mapRequestToAsset(
      new Request(url + path, req as RequestInit)
    );
  }
  return getAssetFromKV(event, { mapRequestToAsset: customKeyModifier }).catch(
    (e) => {
      event.waitUntil(log(e, event.request));
      return fourOhFour(event);
    }
  );
}

async function fourOhFour(event: FetchEvent) {
  let notFoundResponse = await getAssetFromKV(event, {
    mapRequestToAsset: (req) =>
      new Request(`${new URL(req.url).origin}/404.html`, req as RequestInit),
  });

  return new Response(notFoundResponse.body, {
    ...notFoundResponse,
    status: 404,
  });
}
