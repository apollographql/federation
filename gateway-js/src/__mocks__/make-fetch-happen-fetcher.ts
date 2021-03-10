/// <reference path="../make-fetch-happen.d.ts" />
// This explicit reference shouldn't be needed because the project references
// the main project, which includes these type declarations. For some reason,
// VS Code doesn't pick that up though.
// (This may be related to https://github.com/microsoft/TypeScript/issues/36708.)

import {
  fetch,
  Response,
  BodyInit,
  Headers,
  HeadersInit
} from 'apollo-server-env';

import fetcher from 'make-fetch-happen';

interface MakeFetchHappenMock extends jest.MockedFunction<typeof fetch> {
  mockResponseOnce(data?: any, headers?: HeadersInit, status?: number): this;
  mockJSONResponseOnce(data?: object, headers?: HeadersInit): this;
}

const mockMakeFetchHappen = jest.fn(fetcher) as unknown as MakeFetchHappenMock;

mockMakeFetchHappen.mockResponseOnce = (
  data?: BodyInit,
  headers?: Headers,
  status: number = 200,
) => {
  return mockMakeFetchHappen.mockImplementationOnce(async () => {
    return new Response(data, {
      status,
      headers,
    });
  });
};

mockMakeFetchHappen.mockJSONResponseOnce = (
  data = {},
  headers?: Headers,
  status?: number,
) => {
  return mockMakeFetchHappen.mockResponseOnce(
    JSON.stringify(data),
    Object.assign({ 'Content-Type': 'application/json' }, headers),
    status,
  );
};

const makeFetchMock = {
  makeFetchHappenFetcher: mockMakeFetchHappen,
};

jest.doMock('make-fetch-happen', () => makeFetchMock);

export = makeFetchMock;
