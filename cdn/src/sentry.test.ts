import { mockGlobal } from "./mock";
import fetchMock from "fetch-mock";
jest.mock("@zeit/fetch-retry", () => (f: any) => f);

const GITHUB_RELEASE = "https://github.com/apollographql/rust/releases";
beforeEach(() => {
  mockGlobal();
  jest.resetModules();
});

afterEach(fetchMock.resetBehavior);
it("logs an error if GitHub is down", async () => {
  fetchMock.get(`${GITHUB_RELEASE}/latest`, 500);
  const sentry = fetchMock.post(
    `https://sentry.io/api/${SENTRY_PROJECT_ID}/store/`,
    200
  );
  require("./index");

  const request = new Request("/cli/linux");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  // expect(sentry.lastCall())
  const call = sentry.lastCall();
  if (!call) throw new Error("Last call not returned");

  const [url, options] = call;
  expect(url).toContain("sentry.io");
  if (!options) throw new Error("options not defined on request");
  const { event_id, timestamp, ...bodyRest } = JSON.parse(options.body as any);
  bodyRest.exception.values = bodyRest.exception.values.map((val: any) => ({
    ...val,
    stacktrace: {
      ...val.stacktrace,
      // running coverage breaks this snapshot since it instruments the stack trace differently
      frames: [],
    },
  }));
  expect(bodyRest).toMatchInlineSnapshot(`
    Object {
      "environment": "production",
      "exception": Object {
        "values": Array [
          Object {
            "stacktrace": Object {
              "frames": Array [],
            },
            "type": "Error",
            "value": "Error loading latest release for CLI at https://github.com/apollographql/rust/releases/latest",
          },
        ],
      },
      "message": "Error: Error loading latest release for CLI at https://github.com/apollographql/rust/releases/latest",
      "platform": "javascript",
      "request": Object {
        "data": Object {
          "parts": Array [
            null,
          ],
          "type": "",
        },
        "headers": Object {
          "_map": Object {},
        },
        "method": "GET",
        "query_string": "",
        "url": "https://www.test.com/cli/linux",
      },
      "server_name": "worker-cli-cdn-production",
      "tags": Object {
        "app": "worker-cli-cdn",
      },
    }
  `);
});
