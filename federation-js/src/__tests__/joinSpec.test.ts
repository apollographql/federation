import { fixtures } from 'apollo-federation-integration-testsuite';
import { getJoinDefinitions } from "../joinSpec";

const questionableNamesRemap = {
  accounts: 'ServiceA',
  books: 'serviceA',
  documents: 'servicea_2',
  inventory: 'servicea_2_',
  product: '9product*!',
  reviews: 'reviews_9',
};

const fixturesWithQuestionableServiceNames = fixtures.map((service) => ({
  ...service,
  name: questionableNamesRemap[service.name],
}));

describe('join__Graph enum', () => {
  it('correctly uniquifies and sanitizes service names', () => {
    const { graphNameToEnumValueName } = getJoinDefinitions(
      fixturesWithQuestionableServiceNames,
    );

    /**
     * Expectations
     * 1. Non-Alphanumeric characters are replaced with _ (9product*!)
     * 2. Numeric first characters are prefixed with _ (9product*!)
     * 3. Names ending in an underscore followed by numbers `_\d+` are suffixed with _ (reviews_9, servicea_2)
     * 4. Names are uppercased (all)
     * 5. After transformations 1-5, duplicates are suffixed with _{n} where {n} is number of times we've seen the dupe (ServiceA + serviceA, servicea_2 + servicea_2_)
     *
     * Miscellany
     * (serviceA) tests the edge case of colliding with a name we generated
     * (servicea_2_) tests a collision against (documents) post-transformation
     */
    expect(graphNameToEnumValueName).toMatchObject({
      '9product*!': '_9PRODUCT__',
      ServiceA: 'SERVICEA_2',
      reviews_9: 'REVIEWS_9_',
      serviceA: 'SERVICEA_1',
      servicea_2: 'SERVICEA_2__1',
      servicea_2_: 'SERVICEA_2__2',
    });
  })
})
