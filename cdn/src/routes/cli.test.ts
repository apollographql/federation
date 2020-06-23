import { mockGlobal } from "../mock";
import fetchMock from "fetch-mock";
jest.mock("../sentry");
jest.mock("../segment");
jest.mock("@zeit/fetch-retry", () => (f: any) => f);

const GITHUB_RELEASE = "https://github.com/apollographql/rust/releases";
beforeEach(() => {
  mockGlobal();
  jest.resetModules();
});

afterEach(fetchMock.resetBehavior);
it("returns an index.html file if bare url is requested", async () => {
  require("../index");
  const request = new Request("/");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  expect(await response.text()).toEqual("install cli");
});

it("returns the main CLI installer file if bare url is requested that isnt text/html", async () => {
  require("../index");
  const request = new Request("/");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  expect(await response.text()).toEqual("install cli");
  expect(response.headers.get("content-type")).toEqual("text/html");
});

it("returns an 404.html file if unsupported url is requested", async () => {
  require("../index");
  const request = new Request("/foo");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(404);
  expect(await response.text()).toEqual("404.html");
});

it("redirects to / if navigating to /cli", async () => {
  require("../index");
  const request = new Request("/cli");
  const responseOne: any = await self.trigger("fetch", request);
  expect(responseOne.status).toEqual(301);
  const requestTwo = new Request(responseOne.headers.get("location"));
  const responseTwo: any = await self.trigger("fetch", requestTwo);
  expect(responseTwo.status).toEqual(200);
  expect(await responseTwo.text()).toEqual("install cli");
  expect(responseTwo.headers.get("content-type")).toEqual("text/html");
});

it("pulls from the latest tag in GitHub if no version is passed", async () => {
  fetchMock.get(`${GITHUB_RELEASE}/latest`, {
    redirectUrl:
      "https://github.com/apollographql/rust/releases/tag/v0.0.1",
  });

  fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/ap-v0.0.1-linux.tar.gz`, {
    body: "binary file",
  });

  require("../index");
  const request = new Request("/cli/linux");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  expect(await response.text()).toEqual("binary file");
});

it("pulls from a version if passed", async () => {
  fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/ap-v0.0.1-linux.tar.gz`, {
    body: "binary file",
  });

  require("../index");
  const request = new Request("/cli/linux/0.0.1");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  expect(await response.text()).toEqual("binary file");
});

it("returns a 500 if GitHub is down", async () => {
  fetchMock.get(`${GITHUB_RELEASE}/latest`, 500);
  require("../index");
  const { log } = require("../sentry");

  const request = new Request("/cli/linux");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  expect(log).toHaveBeenCalled();
  expect(await response.text()).toContain(
    `Error loading latest release for CLI at ${GITHUB_RELEASE}/latest`
  );
});

it("returns a 500 if asking for a bad version", async () => {
  fetchMock.get(
    `${GITHUB_RELEASE}/download/v0.0.1/ap-v0.0.1-linux.tar.gz`,
    404
  );
  require("../index");

  const request = new Request("/cli/linux/0.0.1");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(404);
  expect(await response.text()).toContain(
    `Couldn't find release for version 0.0.1 on linux`
  );
});

it("returns a 500 and message if something went really wrong", async () => {
  fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/ap-v0.0.1-linux.tar.gz`, {
    status: 500,
  });
  require("../index");

  const request = new Request("/cli/linux/0.0.1");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  expect(await response.text()).toContain(`Internal Server Error`);
});

it("logs internal server error and calls sentry on unexpected issue", async () => {
  jest.mock("./index", () => {
    return {
      router: {
        match: jest.fn(() => {
          throw new Error(":ohno:");
        }),
      },
    };
  });
  require("../index");
  const { log } = require("../sentry");
  const request = new Request("/");
  const response: any = await self.trigger("fetch", request);
  expect(log).toBeCalledWith(new Error(":ohno:"), request);
  expect(response.status).toEqual(500);
  expect(await response.text()).toEqual("Internal Server Error");
  // workers give a delayed response to we need to delay resetting this mock
  await new Promise((r) => {
    setTimeout(() => {
      jest.unmock("./index");
      r();
    }, 5);
  });
});

it("returns an 500 if requested with a POST request", async () => {
  const { log } = require("../sentry");
  log.mockClear();
  require("../index");

  const request = new Request("/", { method: "POST" });
  const response: any = await self.trigger("fetch", request);
  expect(log).not.toHaveBeenCalled();
  expect(response.status).toEqual(404);
  expect(await response.text()).toContain("That route does not exist");
});
