import {
  getAssetFromKV,
  mapRequestToAsset,
} from "@cloudflare/kv-asset-handler";

export async function serveStatic(event: FetchEvent, path: string = "") {
  function customKeyModifier(req: Request): Request {
    return mapRequestToAsset(new Request(req.url + path, req as RequestInit));
  }
  return getAssetFromKV(event, { mapRequestToAsset: customKeyModifier }).catch(
    (e) => {
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
