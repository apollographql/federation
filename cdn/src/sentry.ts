const APP = "worker-cli-cdn";

// https://docs.sentry.io/error-reporting/configuration/?platform=javascript#environment
const ENV = "production";

// https://docs.sentry.io/enriching-error-data/context/?platform=javascript#tagging-events
const TAGS = { app: APP };

// https://docs.sentry.io/error-reporting/configuration/?platform=javascript#server-name
const SERVER_NAME = `${APP}-${ENV}`;

// Indicates the name of the SDK client
const CLIENT_NAME = "cloudflare-workers-sentry";
const CLIENT_VERSION = "0.0.1";
const RETRIES = 5;

// The log() function takes an Error object and the current request
//
// Eg, from a worker:
//
// addEventListener('fetch', event => {
//   event.respondWith(async () => {
//     try {
//       throw new Error('Oh no!')
//     } catch (e) {
//       await log(e, event.request)
//     }
//     return new Response('Logged!')
//   })
// })
export async function log(err: Error, request: Request) {
  try {
    // don't log if no sentry information around
    if (typeof SENTRY_PROJECT_ID === "undefined") return;
    const body = JSON.stringify(toSentryEvent(err, request));

    for (let i = 0; i <= RETRIES; i++) {
      const res = await fetch(
        `https://sentry.io/api/${SENTRY_PROJECT_ID}/store/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Sentry-Auth": [
              "Sentry sentry_version=7",
              `sentry_client=${CLIENT_NAME}/${CLIENT_VERSION}`,
              `sentry_key=${SENTRY_KEY}`,
            ].join(", "),
          },
          body,
        }
      );
      if (res.ok) {
        return;
      }
      // We couldn't send to Sentry, try to log the response at least
      console.error({ httpStatus: res.status, ...(await res.json()) }); // eslint-disable-line no-console
    }
  } catch (e) {
    console.error({ message: "Error when reporting to sentry", error: e });
  }
}

export function toSentryEvent(err: Error, request: Request) {
  const errType = err.name || ((err as any).constructor || {}).name;
  const frames = parse(err);
  const extraKeys = Object.keys(err).filter(
    (key) => !["name", "message", "stack"].includes(key)
  );
  const { searchParams } = new URL(request.url);

  const { v4 } = require("uuid-browser");
  return {
    event_id: v4(),
    message: errType + ": " + (err.message || "<no message>"),
    exception: {
      values: [
        {
          type: errType,
          value: err.message,
          stacktrace: frames.length ? { frames: frames.reverse() } : undefined,
        },
      ],
    },
    extra: extraKeys.length
      ? {
          [errType]: extraKeys.reduce(
            (obj, key) => ({ ...obj, [key]: (err as any)[key] }),
            {}
          ),
        }
      : undefined,
    tags: TAGS,
    platform: "javascript",
    environment: ENV,
    server_name: SERVER_NAME,
    timestamp: Date.now() / 1000,
    request:
      request && request.url
        ? {
            method: request.method,
            url: request.url,
            query_string: searchParams ? searchParams.toString() : "",
            headers: request.headers,
            data: request.body,
          }
        : undefined,
    // release: SENTRY_RELEASE,
  };
}

export function parse(err: Error) {
  return (err.stack || "")
    .split("\n")
    .slice(1)
    .map((line) => {
      if (line.match(/^\s*[-]{4,}$/)) {
        return { filename: line };
      }

      // From https://github.com/felixge/node-stack-trace/blob/1ec9ba43eece124526c273c917104b4226898932/lib/stack-trace.js#L42
      const lineMatch = line.match(
        /at (?:(.+)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/
      );
      if (!lineMatch) {
        return;
      }

      return {
        function: lineMatch[1] || undefined,
        filename: lineMatch[2] || undefined,
        lineno: +lineMatch[3] || undefined,
        colno: +lineMatch[4] || undefined,
        in_app: lineMatch[5] !== "native" || undefined,
      };
    })
    .filter(Boolean);
}
