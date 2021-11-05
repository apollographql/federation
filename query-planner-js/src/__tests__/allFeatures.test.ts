import fs from 'fs';
import { defineFeature, loadFeatures } from 'jest-cucumber';
import path from 'path';
import {
  QueryPlan, QueryPlanner
} from '..';
import {
  Operation,
  Schema,
  buildSchema,
  parseOperation,
} from '@apollo/federation-internals';


// This test looks over all directories under tests/features and finds "supergraphSdl.graphql" in
// each of those directories. It runs all of the .feature cases in that directory against that schema.
// To add test cases against new schemas, create a sub directory under "features" with the new schema
// and new .feature files.

const featuresPath = path.join(__dirname, 'features');

const directories = fs
  .readdirSync(featuresPath, {
    withFileTypes: true,
  })
  .flatMap((entry) =>
    entry.isDirectory() ? path.join(featuresPath, entry.name) : [],
  );

for (const directory of directories) {
  const schemaPath = path.join(directory, 'supergraphSdl.graphql');

  const features = loadFeatures(path.join(directory, '*.feature'));

  features.forEach((feature) => {
    defineFeature(feature, (test) => {
      let schema: Schema;
      let queryPlanner: QueryPlanner;

      beforeAll(() => {
        const supergraphSdl = fs.readFileSync(schemaPath, 'utf8');
        schema = buildSchema(supergraphSdl);
        queryPlanner = new QueryPlanner(schema);
      });

      feature.scenarios.forEach((scenario) => {
        test(scenario.title, ({ given, when, then, pending }) => {
          let operation: Operation;
          let queryPlan: QueryPlan;

          const givenQuery = () => {
            given(/^query$/im, (operationString: string) => {
              operation = parseOperation(schema, operationString);
            });
          };

          const whenUsingAutoFragmentization = () => {
            when(/using autofragmentization/i, () => {
              pending();
            });
          };

          const thenQueryPlanShouldBe = () => {
            then(/^query plan$/i, (expectedQueryPlanString: string) => {
              queryPlan = queryPlanner.buildQueryPlan(operation);

              const expectedQueryPlan = JSON.parse(expectedQueryPlanString);

              expect(queryPlan).toMatchQueryPlan(expectedQueryPlan);
            });
          };

          // Step over each defined step in the .feature and execute the correct
          // matching step fn defined above.
          scenario.steps.forEach(({ stepText }) => {
            const title = stepText.toLocaleLowerCase();

            if (title === 'query') {
              givenQuery();
            } else if (title === 'using autofragmentization') {
              whenUsingAutoFragmentization();
            } else if (title === 'query plan') {
              thenQueryPlanShouldBe();
            } else {
              throw new Error(
                `No matching step found for step "${stepText}" used \
in scenario "${scenario.title}" in feature "${feature.title}"`,
              );
            }
          });
        });
      });
    });
  });
}
