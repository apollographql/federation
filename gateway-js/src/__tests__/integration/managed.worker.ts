import { inspect } from 'util';
import { WorkerThreadTestFunctions } from '../workerThread';
import { mockSupergraphSdlRequestSuccess } from './nockMocks';
import { nockAfterEach, nockBeforeEach } from '../nockAssertions';

export const fakeEndpoint = 'https://example.com';

// Note that Jest isn't setup in worker threads, so you can't use e.g. 'expect'.
export const workerThreadTestFunctions: WorkerThreadTestFunctions = {
  'minimal gateway uses managed federation': {
    preMain() {
      nockBeforeEach();
      mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ });
    },
    postMain() {
      nockAfterEach();
    },
  },
  'minimal gateway fetches from provided `uplinkEndpoints`': {
    preMain() {
      nockBeforeEach();
      mockSupergraphSdlRequestSuccess({ url: fakeEndpoint });
    },
    postMain(uplinkSupergraphManager) {
      try {
        const uplinkEndpoints = uplinkSupergraphManager?.uplinkEndpoints;
        if (!(uplinkEndpoints?.length === 1 && uplinkEndpoints[0] === fakeEndpoint)) {
          throw new Error(`Unexpected Uplink endpoints: ${inspect(uplinkEndpoints)}`);
        }
      } finally {
        nockAfterEach();
      }
    },
  },
  'minimal gateway fetches from (deprecated) provided `schemaConfigDeliveryEndpoint`': {
    preMain() {
      nockBeforeEach();
      mockSupergraphSdlRequestSuccess({ url: fakeEndpoint });
    },
    postMain(uplinkSupergraphManager) {
      try {
        const uplinkEndpoints = uplinkSupergraphManager?.uplinkEndpoints;
        if (!(uplinkEndpoints?.length === 1 && uplinkEndpoints[0] === fakeEndpoint)) {
          throw new Error(`Unexpected Uplink endpoints: ${inspect(uplinkEndpoints)}`);
        }
      } finally {
        nockAfterEach();
      }
    },
  },
  'minimal gateway supports a custom fetcher': {
    preMain() {
      nockBeforeEach();
      mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ });
    },
    postMain() {
      nockAfterEach();
    }
  },
};
