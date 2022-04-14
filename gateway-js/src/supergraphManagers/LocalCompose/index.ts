// TODO(trevor:removeServiceList) the whole file goes away
import type { Logger } from '@apollo/utils.logger';
import { composeServices } from '@apollo/composition';
import {
  GetDataSourceFunction,
  SupergraphSdlHookOptions,
  SupergraphManager,
} from '../../config';
import { ServiceDefinition } from '@apollo/federation-internals';

export interface LocalComposeOptions {
  logger?: Logger;
  localServiceList: ServiceDefinition[];
}

export class LocalCompose implements SupergraphManager {
  private config: LocalComposeOptions;
  private getDataSource?: GetDataSourceFunction;

  constructor(options: LocalComposeOptions) {
    this.config = options;
    this.issueDeprecationWarnings();
  }

  private issueDeprecationWarnings() {
    this.config.logger?.warn(
      'The `localServiceList` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the `LocalCompose` supergraph manager exported by `@apollo/gateway`.',
    );
  }

  public async initialize({ getDataSource }: SupergraphSdlHookOptions) {
    this.getDataSource = getDataSource;
    let supergraphSdl: string | null = null;
    try {
      supergraphSdl = this.createSupergraphFromServiceList(
        this.config.localServiceList,
      );
    } catch (e) {
      this.logUpdateFailure(e);
      throw e;
    }
    return {
      supergraphSdl,
    };
  }

  private createSupergraphFromServiceList(serviceList: ServiceDefinition[]) {
    this.config.logger?.debug(
      `Composing schema from service list: \n${serviceList
        .map(({ name, url }) => `  ${url || 'local'}: ${name}`)
        .join('\n')}`,
    );

    const compositionResult = composeServices(serviceList);
    const errors = compositionResult.errors;
    if (errors) {
      throw Error(
        "A valid schema couldn't be composed. The following composition errors were found:\n" +
          errors.map((e) => '\t' + e.message).join('\n'),
      );
    } else {
      const { supergraphSdl } = compositionResult;
      for (const service of serviceList) {
        this.getDataSource?.(service);
      }

      this.config.logger?.debug('Schema loaded and ready for execution');

      return supergraphSdl;
    }
  }

  private logUpdateFailure(e: any) {
    this.config.logger?.error(
      'LocalCompose failed to update supergraph with the following error: ' +
        (e.message ?? e),
    );
  }
}
