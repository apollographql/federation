import gql from 'graphql-tag';
import { buildSubgraph, federationMetadata } from '..';

it('detects federation 1 subgraphs correctly', () => {
  const schema = gql`
    type Query {
      s: String
    }
  `;

  const subgraph = buildSubgraph('s', 's', schema);
  const metadata = federationMetadata(subgraph.schema);
  expect(metadata).toBeDefined();
  expect(metadata?.isFed2Schema()).toBeFalsy();
});

it('detects federation 2 subgraphs correctly', () => {
  const schema = gql`
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.0")

    type Query {
      s: String
    }
  `;

  const subgraph = buildSubgraph('s', 's', schema);
  const metadata = federationMetadata(subgraph.schema);
  expect(metadata).toBeDefined();
  expect(metadata?.isFed2Schema()).toBeTruthy();
});
