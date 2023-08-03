import gql from 'graphql-tag';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { DocumentNode } from 'graphql';

import { QueryPlan } from '@apollo/query-planner';
import { getFederatedTestingSchema } from './execution-utils';
import { operationFromDocument } from '@apollo/federation-internals';

const buildQueryPlanFeature = loadFeature(
  './gateway-js/src/__tests__/build-query-plan.feature'
);


const features = [
  buildQueryPlanFeature
];

features.forEach((feature) => {
  defineFeature(feature, (test) => {
    feature.scenarios.forEach((scenario) => {
      test(scenario.title, async ({ given, then }) => {
        let operationDocument: DocumentNode;
        let queryPlan: QueryPlan;

        // throws on composition errors
        const { schema, queryPlanner } = getFederatedTestingSchema();

        const givenQuery = () => {
          given(/^query$/im, (operation: string) => {
            operationDocument = gql(operation);
          })
        }

        const thenQueryPlanShouldBe = () => {
          then(/^query plan$/i, async (expectedQueryPlan: string) => {
            queryPlan = await queryPlanner.buildQueryPlan(operationFromDocument(schema, operationDocument));

            const parsedExpectedPlan = JSON.parse(expectedQueryPlan);

            expect(queryPlan).toEqual(parsedExpectedPlan);
          })
        }

        // step over each defined step in the .feature and execute the correct
        // matching step fn defined above
        scenario.steps.forEach(({ stepText }) => {
          const title = stepText.toLocaleLowerCase();
          if (title === "query") givenQuery();
          else if (title === "query plan") thenQueryPlanShouldBe();
          else throw new Error(`Unrecognized steps used in "build-query-plan.feature"`);
        });
      });
    });
  });
});
