import gql from 'graphql-tag';
import { ApolloGateway, LocalGraphQLDataSource } from '../../';
import {
  fixtures,
  spanSerializer,
} from 'apollo-federation-integration-testsuite';
import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemoryMetricExporter,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import { createDataCollectionMeterProvider } from '../../utilities/opentelemetry';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_OS_TYPE,
  ATTR_HOST_ARCH,
  ATTR_CLOUD_PROVIDER,
  ATTR_CLOUD_PLATFORM,
  METRIC_PROCESS_UPTIME,
  METRIC_SYSTEM_CPU_FREQUENCY,
  METRIC_SYSTEM_CPU_LOGICAL_COUNT,
  METRIC_SYSTEM_MEMORY_LIMIT,
} from '@opentelemetry/semantic-conventions/incubating';

expect.addSnapshotSerializer(spanSerializer);

const inMemorySpans = new InMemorySpanExporter();
const tracerProvider = new NodeTracerProvider();
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(inMemorySpans));
tracerProvider.register();

beforeEach(() => {
  inMemorySpans.reset();
});

describe('opentelemetry', () => {
  async function execute(
    executor: any,
    source: string,
    variables: any,
    operationName: string,
  ) {
    await executor({
      source,
      document: gql(source),
      request: {
        variables,
      },
      operationName,
      queryHash: 'hashed',
      context: null,
      cache: {} as any,
    });
  }

  describe('with local data', () => {
    async function gateway(telemetryConfig?: {
      includeDocument?: boolean;
      recordExceptions?: boolean | number;
    }) {
      const localDataSources = Object.fromEntries(
        fixtures.map((f) => [
          f.name,
          new LocalGraphQLDataSource(buildSubgraphSchema(f)),
        ]),
      );
      const gateway = new ApolloGateway({
        localServiceList: fixtures,
        buildService(service) {
          return localDataSources[service.name];
        },
        telemetry: telemetryConfig || {
          includeDocument: true,
          recordExceptions: true,
        },
      });

      const { executor } = await gateway.load();
      return executor;
    }

    const executeValidationFailure = async (telemetryConfig?: {
      includeDocument?: boolean;
      recordExceptions?: boolean | number;
    }) => {
      const executor = await gateway(telemetryConfig);

      const source = `#graphql
      query InvalidVariables($first: Int!, $second: Int!) {
        topReviews(first: $first) {
          body
        }
      }`;

      await execute(executor, source, { upc: '1' }, 'InvalidVariables');
    };

    it('receives spans on success', async () => {
      const executor = await gateway();

      const source = `#graphql
      query GetProduct($upc: String!) {
        product(upc: $upc) {
          name
        }
      }
    `;

      await execute(executor, source, { upc: '1' }, 'GetProduct');
      const spans = inMemorySpans.getFinishedSpans();
      expect(spans).toMatchSnapshot();
      spans.forEach((span) => {
        expect(span.events).toStrictEqual([]);
      });
    });

    it('receives spans on validation failure', async () => {
      await executeValidationFailure();

      const spans = inMemorySpans.getFinishedSpans();
      expect(spans).toMatchSnapshot();
      const validationSpan = spans.find(
        (span) => span.name === 'gateway.validate',
      );

      expect(validationSpan?.events.length).toEqual(2);
    });

    it('receives spans on plan failure', async () => {
      const executor = await gateway();
      const source = `#graphql
      subscription GetProduct($upc: String!) {
        product(upc: $upc) {
          name
        }
      }
    `;

      try {
        await execute(executor, source, { upc: '1' }, 'GetProduct');
      } catch (err) {}
      const spans = inMemorySpans.getFinishedSpans();
      expect(spans).toMatchSnapshot();
      const planSpan = spans.find((span) => span.name === 'gateway.plan');

      expect(planSpan?.events.length).toEqual(1);
    });

    describe('with recordExceptions set to a number', () => {
      it('receives at most that number of exception events', async () => {
        await executeValidationFailure({ recordExceptions: 1 });
        const spans = inMemorySpans.getFinishedSpans();
        const validationSpan = spans.find(
          (span) => span.name === 'gateway.validate',
        );

        expect(validationSpan?.events.length).toEqual(1);
      });
    });

    describe('with recordExceptions set to false', () => {
      it('receives no exception events', async () => {
        await executeValidationFailure({ recordExceptions: false });
        const spans = inMemorySpans.getFinishedSpans();
        const validationSpan = spans.find(
          (span) => span.name === 'gateway.validate',
        );

        expect(validationSpan?.events.length).toEqual(0);
      });
    });

    describe('with includeDocument set to false', () => {
      it('does not include the source document', async () => {
        await executeValidationFailure({ recordExceptions: false });
        const spans = inMemorySpans.getFinishedSpans();
        expect(spans).toMatchSnapshot();
      });
    });
  });

  it('receives spans on fetch failure', async () => {
    const gateway = new ApolloGateway({
      localServiceList: fixtures,
      fetcher: () => {
        throw Error('Nooo');
      },
      telemetry: {
        includeDocument: true,
        recordExceptions: true,
      },
    });

    const { executor } = await gateway.load();

    const source = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        name
      }
    }
    `;

    await execute(executor, source, { upc: '1' }, 'GetProduct');
    const spans = inMemorySpans.getFinishedSpans();
    expect(spans).toMatchSnapshot();
    const fetchSpan = spans.find((span) => span.name === 'gateway.fetch');

    expect(fetchSpan?.events.length).toEqual(1);
  });

  describe('with apollo telemetry enabled', () => {
    it('exports reasonable metric values', async () => {
      const metricExporter = new InMemoryMetricExporter(
        AggregationTemporality.CUMULATIVE,
      );
      const meterProvider = createDataCollectionMeterProvider(metricExporter);

      await meterProvider.shutdown();

      const metrics = metricExporter.getMetrics();
      const gauges = metrics[0].scopeMetrics[0].metrics;

      const cpuCount = gauges.find(
        (m) => m.descriptor.name === METRIC_SYSTEM_CPU_LOGICAL_COUNT,
      );
      const cpuFreq = gauges.find(
        (m) => m.descriptor.name === METRIC_SYSTEM_CPU_FREQUENCY,
      );
      const memory = gauges.find(
        (m) => m.descriptor.name === METRIC_SYSTEM_MEMORY_LIMIT,
      );
      const uptime = gauges.find(
        (m) => m.descriptor.name === METRIC_PROCESS_UPTIME,
      );

      expect(cpuCount).toBeDefined();
      expect(cpuFreq).toBeDefined();
      expect(memory).toBeDefined();
      expect(uptime).toBeDefined();

      // CPU count should be at least 1
      const cpuCountValue = cpuCount!.dataPoints[0].value as number;
      expect(cpuCountValue).toBeGreaterThanOrEqual(1);

      // CPU frequency should be positive (in Hz)
      const cpuFreqValue = cpuFreq!.dataPoints[0].value as number;
      expect(cpuFreqValue).toBeGreaterThan(0);

      // Memory should be positive (in bytes)
      const memoryValue = memory!.dataPoints[0].value as number;
      expect(memoryValue).toBeGreaterThan(0);

      // Uptime starts at 0
      const uptimeValue = uptime!.dataPoints[0].value as number;
      expect(uptimeValue).toBe(0);
    }, 10000);

    it('includes default resource attributes', async () => {
      const metricExporter = new InMemoryMetricExporter(
        AggregationTemporality.CUMULATIVE,
      );
      const meterProvider = createDataCollectionMeterProvider(metricExporter);

      await meterProvider.shutdown();

      const metrics = metricExporter.getMetrics();
      const resource = metrics[0].resource;

      expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('gateway-js');
      expect(resource.attributes[ATTR_SERVICE_INSTANCE_ID]).toBeDefined();
      expect(typeof resource.attributes[ATTR_SERVICE_INSTANCE_ID]).toBe(
        'string',
      );
    }, 10000);

    it('includes metric-specific attributes', async () => {
      const metricExporter = new InMemoryMetricExporter(
        AggregationTemporality.CUMULATIVE,
      );
      const meterProvider = createDataCollectionMeterProvider(metricExporter);

      await meterProvider.shutdown();

      const metrics = metricExporter.getMetrics();
      const gauges = metrics[0].scopeMetrics[0].metrics;

      const uptime = gauges.find(
        (m) => m.descriptor.name === METRIC_PROCESS_UPTIME,
      );
      const cpuFreq = gauges.find(
        (m) => m.descriptor.name === METRIC_SYSTEM_CPU_FREQUENCY,
      );
      const cpuCount = gauges.find(
        (m) => m.descriptor.name === METRIC_SYSTEM_CPU_LOGICAL_COUNT,
      );
      const memory = gauges.find(
        (m) => m.descriptor.name === METRIC_SYSTEM_MEMORY_LIMIT,
      );

      // process.uptime should have OS type and host architecture
      expect(uptime!.dataPoints[0].attributes[ATTR_OS_TYPE]).toBeDefined();
      expect(uptime!.dataPoints[0].attributes[ATTR_HOST_ARCH]).toBeDefined();

      // system.cpu.frequency has no specific attributes
      expect(Object.keys(cpuFreq!.dataPoints[0].attributes)).toHaveLength(0);

      // system.cpu.logical.count should have host architecture
      expect(cpuCount!.dataPoints[0].attributes[ATTR_HOST_ARCH]).toBeDefined();

      // system.memory.limit should have host architecture
      expect(memory!.dataPoints[0].attributes[ATTR_HOST_ARCH]).toBeDefined();
    }, 10000);

    describe('with cloud provider detection', () => {
      let originalEnv: NodeJS.ProcessEnv;

      beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };
      });

      afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
      });

      it('detects AWS Lambda environment', async () => {
        process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';
        process.env.AWS_REGION = 'us-east-1';
        process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x';

        const metricExporter = new InMemoryMetricExporter(
          AggregationTemporality.CUMULATIVE,
        );
        const meterProvider = createDataCollectionMeterProvider(metricExporter);

        await meterProvider.shutdown();

        const metrics = metricExporter.getMetrics();
        const resource = metrics[0].resource;

        expect(resource.attributes[ATTR_CLOUD_PROVIDER]).toBe('aws');
        expect(resource.attributes[ATTR_CLOUD_PLATFORM]).toBe('aws_lambda');
      }, 10000);

      it('detects Azure App Service environment', async () => {
        process.env.WEBSITE_SITE_NAME = 'test-app-service';
        process.env.WEBSITE_INSTANCE_ID = 'test-instance';
        process.env.WEBSITE_HOME_STAMPNAME = 'test-stamp';

        const metricExporter = new InMemoryMetricExporter(
          AggregationTemporality.CUMULATIVE,
        );
        const meterProvider = createDataCollectionMeterProvider(metricExporter);

        await meterProvider.shutdown();

        const metrics = metricExporter.getMetrics();
        const resource = metrics[0].resource;

        expect(resource.attributes[ATTR_CLOUD_PROVIDER]).toBe('azure');
        expect(resource.attributes[ATTR_CLOUD_PLATFORM]).toBe(
          'azure_app_service',
        );
      }, 10000);
    });
  });
});
