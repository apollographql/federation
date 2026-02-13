import type { Attributes, Exception, Span } from '@opentelemetry/api';
import opentelemetry from '@opentelemetry/api';
import type { GatewayGraphQLRequestContext } from '@apollo/server-gateway-interface';
import { cpuCountSync } from 'node-cpu-count';
import * as os from 'node:os';
import { OperationContext } from '../operationContext';
import {ATTR_OS_TYPE, ATTR_HOST_ARCH, OS_TYPE_VALUE_LINUX, ATTR_OS_NAME, METRIC_SYSTEM_MEMORY_LIMIT, METRIC_SYSTEM_CPU_LOGICAL_COUNT, METRIC_SYSTEM_CPU_FREQUENCY, ATTR_SERVICE_NAME, ATTR_SERVICE_INSTANCE_ID, METRIC_PROCESS_UPTIME} from '@opentelemetry/semantic-conventions/incubating';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  PushMetricExporter,
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
import { detectResourcesSync, hostDetectorSync, osDetectorSync, Resource } from '@opentelemetry/resources';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { randomUUID } from 'node:crypto';

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

const APOLLO_OTEL_ENDPOINT = "https://usage-reporting.api.apollographql.com";
const EXPORT_INTERVAL_SECONDS = 60 * 60; // one hour
const EXPORT_INTERVAL_MILLIS = 1000 * EXPORT_INTERVAL_SECONDS;
const SI_MEGA = 1000000;

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

// Exposed for unit testing with a testable exporter
export function createDataCollectionMeterProvider(metricExporter: PushMetricExporter): MeterProvider {
  // cloud resource detectors
  const resource = detectResourcesSync({
    detectors: [
      alibabaCloudEcsDetector,
      awsEc2Detector,
      awsBeanstalkDetector,
      awsEcsDetector,
      awsEksDetector,
      awsLambdaDetector,
      gcpDetector,
      azureVmDetector,
      azureFunctionsDetector,
      azureAppServiceDetector
    ],
  })

  const meterProvider = new MeterProvider({
    resource: resource.merge(
      new Resource ({
        [ATTR_SERVICE_NAME]: 'gateway-js',
        [ATTR_SERVICE_INSTANCE_ID]: randomUUID()
      }),
    ),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: EXPORT_INTERVAL_MILLIS,
      }),
    ],
  })

  // grab the host and OS attributes explicitly so we can create `linux.distribution`
  const hostAttrs = hostDetectorSync.detect().attributes
  const osAttrs = osDetectorSync.detect().attributes
  const osType = osAttrs[ATTR_OS_TYPE]
  const hostArch = hostAttrs[ATTR_HOST_ARCH]
  const meter = meterProvider.getMeter("apollo/gateway-js")

  const uptimeGauge = meter.createObservableGauge(METRIC_PROCESS_UPTIME, {
    "description": "The uptime of the JS federation gateway running"
  })

  const instanceAttrs: Attributes = {
    [ATTR_OS_TYPE]: osType,
    [ATTR_HOST_ARCH]: hostArch
  }
  if (osType === OS_TYPE_VALUE_LINUX) {
    instanceAttrs["linux.distribution"] = osAttrs[ATTR_OS_NAME];
  }

  let uptime = 0;
  uptimeGauge.addCallback((result) => {
    result.observe(uptime, instanceAttrs)
    uptime = uptime + EXPORT_INTERVAL_SECONDS; 
  })

  const cpuFreqGauge = meter.createObservableGauge(METRIC_SYSTEM_CPU_FREQUENCY, {
    "description": "The CPU frequency of the underlying instance the JS federation gateway is deployed to",
    "unit": "Hz"
  })
  cpuFreqGauge.addCallback((result) => {
    const cpus = os.cpus();
    const average_frequency = os.cpus().map((a) => a.speed * SI_MEGA).reduce((partialSum, a) => partialSum + a, 0) / cpus.length
    result.observe(average_frequency)
  })

  const cpuCountGauge = meter.createObservableGauge(METRIC_SYSTEM_CPU_LOGICAL_COUNT, {
    "description": "The number of CPUs reported by the instance the JS federation gateway is running on"
  })
  cpuCountGauge.addCallback((result) => {
    result.observe(cpuCountSync(), {
      [ATTR_HOST_ARCH]: hostArch,
    })
  })

  const totalMemoryGauge = meter.createObservableGauge(METRIC_SYSTEM_MEMORY_LIMIT, {
    "description": "The amount of memory reported by the instance the JS federation gateway is running on",
    "unit": "bytes"
  })
  totalMemoryGauge.addCallback((result) => {
    result.observe(os.totalmem(), {
      [ATTR_HOST_ARCH]: hostArch,
    })
  })

  return meterProvider
}

export function createDataCollectionExporter(): MeterProvider {
  return createDataCollectionMeterProvider(new OTLPMetricExporter({ url: APOLLO_OTEL_ENDPOINT }));
}
