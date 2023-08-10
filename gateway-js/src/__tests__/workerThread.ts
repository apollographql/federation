import { workerThreadMain } from '../QueryPlanManager';
import { UplinkSupergraphManager } from '../supergraphManagers';
import {
  workerThreadTestFunctions as managed_workerThreadTestFunctions
} from './integration/managed.worker';

export interface WorkerThreadTestFunctions {
  [testName: string]: {
    preMain?(): void
    postMain?(
      uplinkSupergraphManager?: UplinkSupergraphManager
    ): void
  }
}

export async function workerThreadTestMain() {
  const testFunctions: WorkerThreadTestFunctions = {
    ...managed_workerThreadTestFunctions,
  };
  const testName = process.env.APOLLO_GATEWAY_JEST_TEST_NAME;
  if (testName) {
    const preMain = testFunctions[testName]?.preMain;
    if (preMain) { preMain() }
  }
  const UplinkSupergraphManager = await workerThreadMain();
  if (testName) {
    const postMain = testFunctions[testName]?.postMain;
    if (postMain) { postMain(UplinkSupergraphManager) }
  }
}
