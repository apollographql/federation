import { Method } from "tiny-request-router";

import { log } from "./sentry";
import { router } from "./routes";

self.addEventListener("fetch", async (event) => {
  try {
    const request = event.request;
    const { pathname } = new URL(request.url);
    const match = router.match(request.method as Method, pathname);
    if (match) {
      match.handler(match.params, event);
    } else {
      return event.respondWith(
        new Response("That route does not exist", { status: 404 })
      );
    }
  } catch (e) {
    event.waitUntil(log(e, event.request));
    event.respondWith(new Response("Internal Server Error", { status: 500 }));
  }
});
