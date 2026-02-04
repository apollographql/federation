import type { Attributes, Exception, Span } from '@opentelemetry/api';
import opentelemetry from '@opentelemetry/api';
import type { GatewayGraphQLRequestContext } from '@apollo/server-gateway-interface';
import { cpuCountSync } from 'node-cpu-count';
import * as os from 'node:os';
import { OperationContext } from '../operationContext';
import {ATTR_OS_TYPE, ATTR_HOST_ARCH, OS_TYPE_VALUE_LINUX, ATTR_OS_NAME} from '@opentelemetry/semantic-conventions/incubating';
import {
  AggregationTemporalitySelector,
  ConsoleMetricExporter,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { alibabaCloudEcsDetector } from '@opentelemetry/resource-detector-alibaba-cloud';
import {
  awsBeanstalkDetector,
  awsEc2Detector,
  awsEcsDetector,
  awsEksDetector,
  awsLambdaDetector,
} from '@opentelemetry/resource-detector-aws';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp';
import {
  azureAppServiceDetector,
  azureFunctionsDetector,
  azureVmDetector,
} from '@opentelemetry/resource-detector-azure';
import { detectResourcesSync, hostDetectorSync, Resource } from '@opentelemetry/resources';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';

export type OpenTelemetryConfig = {
  /**
   * Whether to include the `graphql.document` attribute in the `gateway.request` OpenTelemetry spans.
   * When set to `true`, the attribute will contain the entire GraphQL document for the current request.
   *
   * Defaults to `false`, meaning that the GraphQL document will not be added as a span attribute.
   */
  includeDocument?: boolean;
  /**
   * Whether to record the GraphQL and internal errors that take place while processing a request as
   * exception events in the OpenTelemetry spans in which they occur.
   *
   * When a number is given as a value, it represents the maximum number of exceptions that will be
   * reported in each OpenTelemetry span.
   *
   * Regardless of the value of this setting, the span status code will be set to `ERROR` when a GraphQL
   * or internal error occurs.
   *
   * Defaults to `false`, meaning that no exceptions will be reported in any spans.
   */
  recordExceptions?: boolean | number;
};

export enum OpenTelemetrySpanNames {
  REQUEST = 'gateway.request',
  PLAN = 'gateway.plan',
  FETCH = 'gateway.fetch',
  POST_PROCESSING = 'gateway.postprocessing',
  EXECUTE = 'gateway.execute',
  VALIDATE = 'gateway.validate',
}

/*
   When adding any more, please refer to:
   https://opentelemetry.io/docs/specs/otel/common/attribute-naming/
   https://opentelemetry.io/docs/specs/otel/trace/semantic_conventions/instrumentation/graphql/
*/
export enum OpenTelemetryAttributeNames {
  GRAPHQL_DOCUMENT = 'graphql.document',
  GRAPHQL_OPERATION_NAME = 'graphql.operation.name',
  GRAPHQL_OPERATION_NAME_DEPRECATED = 'operationName', // deprecated in favor of GRAPHQL_OPERATION_NAME
  GRAPHQL_OPERATION_TYPE = 'graphql.operation.type',
}

const { name, version } = require('../../package.json');
export const tracer = opentelemetry.trace.getTracer(`${name}/${version}`);

export interface SpanAttributes extends Attributes {
  /**
   * @deprecated in favor of `graphql.operation.name`
   */
  [OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME_DEPRECATED]?: string;
  [OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME]?: string;
  [OpenTelemetryAttributeNames.GRAPHQL_OPERATION_TYPE]?: string;
  [OpenTelemetryAttributeNames.GRAPHQL_DOCUMENT]?: string;
}

export function requestContextSpanAttributes(
  requestContext: GatewayGraphQLRequestContext,
  config: OpenTelemetryConfig | undefined
): SpanAttributes {
  const spanAttributes: SpanAttributes = {};

  if (requestContext.operationName) {
    spanAttributes[
      OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME_DEPRECATED
    ] = requestContext.operationName;
    spanAttributes[OpenTelemetryAttributeNames.GRAPHQL_OPERATION_NAME] =
      requestContext.operationName;
  }
  if (config?.includeDocument && requestContext.source) {
    spanAttributes[OpenTelemetryAttributeNames.GRAPHQL_DOCUMENT] =
      requestContext.source;
  }

  return spanAttributes;
}

export function operationContextSpanAttributes(
  operationContext: OperationContext
): SpanAttributes {
  const spanAttributes: SpanAttributes = {};

  if (operationContext.operation.operation) {
    spanAttributes[OpenTelemetryAttributeNames.GRAPHQL_OPERATION_TYPE] =
      operationContext.operation.operation;
  }

  return spanAttributes;
}

export function recordExceptions(
  span: Span,
  exceptions: readonly Exception[],
  config: OpenTelemetryConfig | undefined
) {
  const recordExceptions = config?.recordExceptions;

  if (recordExceptions === undefined || recordExceptions === false) {
    return;
  }

  let exceptionsToRecord;

  if (recordExceptions === true) {
    exceptionsToRecord = exceptions;
  } else if (recordExceptions <= 0) {
    return;
  } else {
    exceptionsToRecord = exceptions.slice(0, recordExceptions)
  }

  for (const exception of exceptionsToRecord) {
    span.recordException(exception);
  }
}

export function configureOpenTelemetryWithDataCollection(): MeterProvider {
  const resource = detectResourcesSync({
    detectors: [alibabaCloudEcsDetector, awsEc2Detector, awsBeanstalkDetector, awsEcsDetector, awsEksDetector, awsLambdaDetector, gcpDetector, azureVmDetector, azureFunctionsDetector, azureAppServiceDetector],
  })

  const metricExporter = new ConsoleMetricExporter();
  const resourceExporter = new ConsoleResourceMetricExporter();
  const meterProvider = new MeterProvider({
    resource: resource.merge(
      new Resource ({
        // Replace with any string to identify this service in your system
        'service.name': 'gateway',
      }),
    ),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 10000,
      }),
      new PeriodicExportingMetricReader({
        exporter: resourceExporter,
        exportIntervalMillis: 10000,
      })
    ],
  });

  const hostAttrs = hostDetectorSync.detect().attributes
  const osType = hostAttrs[ATTR_OS_TYPE]
  const hostArch = hostAttrs[ATTR_HOST_ARCH]
  const meter = meterProvider.getMeter("apollo/gateway")

  // gateway.instance

  const instanceGauge = meter.createObservableGauge("gateway.instance", {
    "description": "The number of instances of the gateway running"
  })

  let instanceAttrs: Attributes = {
    [ATTR_OS_TYPE]: osType,
    [ATTR_HOST_ARCH]: hostArch
  }
  if (osType === OS_TYPE_VALUE_LINUX) {
    instanceAttrs["linux.distribution"] = hostAttrs[ATTR_OS_NAME];
  }
  instanceGauge.addCallback((result) => {
    result.observe(1, instanceAttrs)
  })

  // gateway.instance.cpu_freq
  const cpuFreqGauge = meter.createObservableGauge("gateway.instance.cpu_freq", {
    "description": "The CPU frequency of the underlying instance the router is deployed to",
    "unit": "Mhz"
  })
  cpuFreqGauge.addCallback((result) => {
    const cpus = os.cpus();
    const average_frequency = os.cpus().map((a) => a.speed).reduce((partialSum, a) => partialSum + a, 0) / cpus.length
    result.observe(average_frequency)
  })

  // gateway.instance.cpu_count
  const cpuCountGauge = meter.createObservableGauge("gateway.instance.cpu_count", {
    "description": "The number of CPUs reported by the instance the gateway is running on"
  })
  cpuCountGauge.addCallback((result) => {
    result.observe(cpuCountSync(), {
      [ATTR_HOST_ARCH]: hostArch,
    });
  })

  // gateway.instance.total_memory
  const totalMemoryGauge = meter.createObservableGauge("gateway.instance.total_memory", {
    "description": "The amount of memory reported by the instance the router is running on",
    "unit": "bytes"
  })
  totalMemoryGauge.addCallback((result) => {
    result.observe(os.totalmem(), {
      [ATTR_HOST_ARCH]: hostArch,
    });
  })

  return meterProvider
}

/**
 * Console exporter that logs ONLY the `metrics.resource` portion
 * of every export request.  Useful when you just want to inspect
 * the attributes attached to the resource (service name, version,
 * environment, etc.) and not the individual metric datapoints.
 */
export class ConsoleResourceMetricExporter extends ConsoleMetricExporter {
  /** Re-expose the constructor so callers can still pass options through */
  constructor(options?: { temporalitySelector?: AggregationTemporalitySelector }) {
    super(options);
  }

  /** Override the export hook to log the resource and nothing else. */
  override export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void
  ): void {
    if (this._shutdown) {
      // follow spec: once shutdown, every call must fail fast
      setImmediate(resultCallback, { code: ExportResultCode.FAILED });
      return;
    }

    // The only new behaviour: print the resource object.
    console.dir(metrics.resource, { depth: null });

    // report success to the SDK
    setImmediate(resultCallback, { code: ExportResultCode.SUCCESS });
  }

  /* All other behaviour (forceFlush, shutdown, temporality, etc.)
   * inherits directly from ConsoleMetricExporter with no change */
}
