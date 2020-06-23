import { mockGlobal } from "../mock";
import fetchMock from "fetch-mock";
jest.mock("@zeit/fetch-retry", () => (f: any) => f);
jest.mock("uuid-browser", () => ({
  v4: jest.fn(() => `mock_uuid`),
}));

const GITHUB_RELEASE = "https://github.com/apollographql/rust/releases";
beforeEach(() => {
  mockGlobal();
  jest.resetModules();
});

afterEach(fetchMock.resetBehavior);
it("sends an event to segment when a build is downloaded", async () => {
  const segment = fetchMock.post("https://api.segment.io/v1/track", 200);

  require("../index");

  const request = new Request("/telemetry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Apollo CLI Mock",
    },
    body: JSON.stringify({
      command: "schema push",
      machine_id: "1234",
      session_id: "12345",
      platform: {
        os: "linux",
        is_ci: false,
        ci_name: null,
      },
      release_version: "0.0.1",
    }),
  });

  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  const call = segment.lastCall();
  if (!call) throw new Error("Last call not returned");

  const [url, options] = call;
  expect(url).toContain("segment.io");
  expect(JSON.parse(options!.body as any)).toMatchInlineSnapshot(`
    Object {
      "context": Object {
        "app": "Apollo CLI Mock",
        "library": "CLI Worker",
        "os": "linux",
      },
      "event": "schema push",
      "messageId": "CLI Worker-mock_uuid",
      "properties": Object {
        "command": "schema push",
        "machine_id": "1234",
        "platform": Object {
          "ci_name": null,
          "is_ci": false,
          "os": "linux",
        },
        "release_version": "0.0.1",
        "session_id": "12345",
      },
      "userId": "1234",
    }
  `);
});

it("doesn't report invalid messages", async () => {
  const segment = fetchMock.post("https://api.segment.io/v1/track", 200);

  require("../index");

  const request = new Request("/telemetry", {
    method: "POST",
    headers: {
      "user-agent": "Apollo CLI Mock",
    },
    body: JSON.stringify({
      command: "schema push",
      machine_id: "1234",
      session_id: "12345",
      platform: {
        os: "linux",
        is_ci: false,
        ci_name: null,
      },
      release_version: "0.0.1",
    }),
  });

  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  const call = segment.lastCall();
  if (!call) throw new Error("Last call not returned");

  const [url, options] = call;
  expect(url).toContain("segment.io");
  expect(JSON.parse(options!.body as any)).toMatchInlineSnapshot(`
      Object {
        "context": Object {
          "app": "Apollo CLI Mock",
          "library": "CLI Worker",
          "os": "linux",
        },
        "event": "schema push",
        "messageId": "CLI Worker-mock_uuid",
        "properties": Object {
          "command": "schema push",
          "machine_id": "1234",
          "platform": Object {
            "ci_name": null,
            "is_ci": false,
            "os": "linux",
          },
          "release_version": "0.0.1",
          "session_id": "12345",
        },
        "userId": "1234",
      }
    `);
});
