import { Router, Params } from "tiny-request-router";
import { handleLegacyCLI } from "./legacy-cli";
import { serveStatic } from "./static";
import { handleCLI } from "./cli";
import { reportTelemetry } from "./telemetry";
import { log } from "../sentry";

type Handler = (params: Params, event: FetchEvent) => void;
const router = new Router<Handler>();

router.post("/telemetry", reportTelemetry);

router.get(
  "/legacy-cli/:platform?/:version?",
  ({ platform, version }, event) => {
    if (!platform || !version) {
      return event.respondWith(
        new Response(
          `Installing the legacy CLI is only supported for the darwin platform and requires a specific version. Please use npm to install the legacy CLI`,
          { status: 500 }
        )
      );
    }
    if (platform !== "darwin") {
      return event.respondWith(
        new Response(
          `Installing the legacy CLI for usage outside of the Apollo iOS isn't supported. Please use npm for installing the legacy CLI`,
          { status: 500 }
        )
      );
    }
    event.respondWith(
      handleLegacyCLI({ platform, version }, event).catch((e) => {
        event.waitUntil(log(e, event.request));
        return new Response(e.message || e.toString(), { status: 500 });
      })
    );
  }
);

router.get("/cli/:platform/:version?", ({ platform, version }, event) =>
  event.respondWith(
    handleCLI({ platform, version }, event).catch((e) => {
      event.waitUntil(log(e, event.request));
      return new Response(e.message || e.toString(), { status: 500 });
    })
  )
);
router.head("/cli/:platform/:version?", ({ platform, version }, event) =>
  event.respondWith(
    handleCLI({ platform, version }, event).catch((e) => {
      event.waitUntil(log(e, event.request));
      return new Response(e.message || e.toString(), { status: 500 });
    })
  )
);

router.get("/cli", (_, event) => {
  const url = new URL(event.request.url);
  event.respondWith(Response.redirect(`https://${url.hostname}/`, 301));
});

router.get("/", (_, event) => {
  event.respondWith(
    (async () => {
      const response = await serveStatic(event, "/install.sh");
      response.headers.set("content-type", "text/html");
      return response;
    })()
  );
});

router.get("*", (_, event) => {
  event.respondWith(serveStatic(event));
});

export { router };
