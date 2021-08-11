import { getServiceDefinitionsFromRemoteEndpoint } from '../loadServicesFromRemoteEndpoint';
import { RemoteGraphQLDataSource } from '../datasources';

describe('getServiceDefinitionsFromRemoteEndpoint', () => {
  it('errors when no URL was specified', async () => {
    const serviceSdlCache = new Map<string, string>();
    const dataSource = new RemoteGraphQLDataSource({ url: '' });
    const serviceList = [{ name: 'test', dataSource }];
    await expect(
      getServiceDefinitionsFromRemoteEndpoint({
        serviceList,
        serviceSdlCache,
        getServiceIntrospectionHeaders: async () => ({})
      }),
    ).rejects.toThrowError(
      "Tried to load schema for 'test' but no 'url' was specified.",
    );
  });

  it("errors when no name was specified", async () => {
    const serviceSdlCache = new Map<string, string>();
    const url = 'http://api.example.com/graphql';

    const dataSource = new RemoteGraphQLDataSource({ url });
    const serviceList = [{ url, dataSource }];
    await expect(
      getServiceDefinitionsFromRemoteEndpoint({
        serviceList,
        serviceSdlCache,
        getServiceIntrospectionHeaders: async () => ({})
      }),
    ).rejects.toThrowError(
      "Tried to load schema for service but no 'name' was specified.",
    );
  });

  it('throws when the downstream service returns errors', async () => {
    const serviceSdlCache = new Map<string, string>();
    const host = 'http://host-which-better-not-resolve';
    const url = host + '/graphql';

    const dataSource = new RemoteGraphQLDataSource({ url });
    const serviceList = [{ name: 'test', url, dataSource }];
    // Depending on the OS's resolver, the error may result in an error
    // of `EAI_AGAIN` or `ENOTFOUND`.  This `toThrowError` uses a Regex
    // to match either case.
    await expect(
      getServiceDefinitionsFromRemoteEndpoint({
        serviceList,
        serviceSdlCache,
        getServiceIntrospectionHeaders: async () => ({}),
      }),
    ).rejects.toThrowError(
      /^Couldn't load service definitions for "test" at http:\/\/host-which-better-not-resolve\/graphql: request to http:\/\/host-which-better-not-resolve\/graphql failed, reason: getaddrinfo (ENOTFOUND|EAI_AGAIN)/,
    );
  });
});
