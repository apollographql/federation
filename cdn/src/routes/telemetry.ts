import { track } from "../segment";

interface Platform {
  // the platform from which the command was run (i.e. linux, macOS, or windows)
  os: string;
  // if we think this command is being run in a CLI
  is_ci: boolean;
  // the name of the CI we think is being used
  ci_name: string | null;
}

interface Session {
  // the command usage where commands are paths and flags are query strings
  // i.e. ap schema push --graph --variant would become ap/schema/push?graph&variant
  command: string | null;
  // Apollo generated machine ID. This is a UUID and stored globally at ~/.apollo/config.toml
  machine_id: string;
  // A unique session id
  session_id: string;
  // Information about the current architecture/platform
  platform: Platform;
  // The current version of the CLI
  release_version: string;
}

export function reportTelemetry(_: any, event: FetchEvent) {
  const { headers } = event.request;
  const contentType = headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return event.respondWith(
      new Response("Internal Server Error", { status: 500 })
    );
  }

  const body = event.request.json();
  // we make this non-block to respond back to the CLI right away
  event.waitUntil(waitUntil(event, body));
  event.respondWith(respondWith(body));
}

async function respondWith(body: Promise<Session>): Promise<Response> {
  await body;
  return new Response("Report recieved", { status: 200 });
}

export async function waitUntil(event: FetchEvent, body: Promise<Session>) {
  const app = event.request.headers.get("User-Agent") || "Unknown app";
  const parsed = await body;
  const event_payload = {
    userId: parsed.machine_id,
    event: parsed.command,
    properties: parsed,
    context: {
      app,
      os: parsed.platform.os,
    },
  };

  await track(event_payload);
}
