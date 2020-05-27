import { mockGlobal } from "../mock";
import fetchMock from "fetch-mock";
jest.mock("../sentry");
jest.mock("../segment");
jest.mock("@zeit/fetch-retry", () => (f: any) => f);

const GITHUB_RELEASE =
  "https://github.com/apollographql/apollo-tooling/releases";
beforeEach(() => {
  mockGlobal();
  jest.resetModules();
});

afterEach(fetchMock.resetBehavior);

it("pulls from a version if passed", async () => {
  fetchMock.get(
    `${GITHUB_RELEASE}/download/apollo@0.0.1/apollo-v0.0.1-darwin-x64.tar.gz`,
    {
      body: "binary file",
    }
  );

  require("../index");
  const request = new Request("/legacy-cli/darwin/0.0.1");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(200);
  expect(await response.text()).toEqual("binary file");
});

it("returns a 500 if no version is passed", async () => {
  require("../index");
  const request = new Request("/legacy-cli/darwin");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  expect(await response.text()).toContain(
    `the darwin platform and requires a specific version`
  );
});

it("returns a 500 if no platform is passed", async () => {
  require("../index");
  const request = new Request("/legacy-cli");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  expect(await response.text()).toContain(
    `the darwin platform and requires a specific version`
  );
});

it("returns a 500 if not asking for darwin builds", async () => {
  require("../index");
  const request = new Request("/legacy-cli/linux/1.0.0");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  expect(await response.text()).toContain(
    `Installing the legacy CLI for usage outside of the Apollo iOS isn't supported.`
  );
});

it("returns a 500 if GitHub is down", async () => {
  fetchMock.get(
    `${GITHUB_RELEASE}/download/apollo@0.0.1/apollo-v0.0.1-darwin-x64.tar.gz`,
    500
  );
  require("../index");
  const request = new Request("/legacy-cli/darwin/0.0.1");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(500);
  expect(await response.text()).toContain(`Error when loading the legacy CLI`);
});

it("returns a 500 if asking for a bad version", async () => {
  fetchMock.get(
    `${GITHUB_RELEASE}/download/apollo@0.0.1/apollo-v0.0.1-darwin-x64.tar.gz`,
    404
  );
  require("../index");
  const request = new Request("/legacy-cli/darwin/0.0.1");
  const response: any = await self.trigger("fetch", request);
  expect(response.status).toEqual(404);
  expect(await response.text()).toContain(
    `Couldn't find release for version 0.0.1 on darwin`
  );
});
