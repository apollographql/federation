import { mockGlobal } from "./mock";
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
  fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/ap-v0.0.1-linux.tar.gz`, {
    body: "binary file",
  });

  const segment = fetchMock.post("https://api.segment.io/v1/track", 200);

  require("./index");

  const request = new Request("/cli/linux/0.0.1");

  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  const call = segment.lastCall();
  if (!call) throw new Error("Last call not returned");

  const [url, options] = call;
  expect(url).toContain("segment.io");
  expect(JSON.parse(options!.body as any)).toMatchInlineSnapshot(`
    Object {
      "anonymousId": "mock_uuid",
      "context": Object {
        "app": "Apollo CLI",
        "library": "CLI Worker",
        "os": "linux",
      },
      "event": "CLI download",
      "messageId": "CLI Worker-mock_uuid",
      "properties": Object {
        "release_version": "0.0.1",
      },
    }
  `);
});

it("sends an event to segment when a legacy build is downloaded", async () => {
  fetchMock.get(
    `https://github.com/apollographql/apollo-tooling/releases/download/apollo@0.0.1/apollo-v0.0.1-darwin-x64.tar.gz`,
    {
      body: "binary file",
    }
  );

  const segment = fetchMock.post("https://api.segment.io/v1/track", 200);

  require("./index");

  const request = new Request("/legacy-cli/darwin/0.0.1");

  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  const call = segment.lastCall();
  if (!call) throw new Error("Last call not returned");

  const [url, options] = call;
  expect(url).toContain("segment.io");
  expect(JSON.parse(options!.body as any)).toMatchInlineSnapshot(`
    Object {
      "anonymousId": "mock_uuid",
      "context": Object {
        "app": "Apollo iOS",
        "library": "CLI Worker",
        "os": "darwin",
      },
      "event": "Legacy CLI download",
      "messageId": "CLI Worker-mock_uuid",
      "properties": Object {
        "release_version": "0.0.1",
      },
    }
  `);
});
