import { DocumentNode } from "graphql";
import { asFed2SubgraphDocument, buildSubgraph, errorCauses } from "..";

// Builds the provided subgraph (using name 'S' for the subgraph) and, if the
// subgraph is invalid/has errors, return those errors as a list of [code, message].
// If the subgraph is valid, return undefined.
export function buildForErrors(
  subgraphDefs: DocumentNode,
  options?: {
    subgraphName?: string,
    asFed2?: boolean,
  }
): [string, string][] | undefined {
  try {
    const doc = (options?.asFed2 ?? true) ? asFed2SubgraphDocument(subgraphDefs) : subgraphDefs;
    const name = options?.subgraphName ?? 'S';
    buildSubgraph(name, `http://${name}`, doc).validate();
    return undefined;
  } catch (e) {
    const causes = errorCauses(e);
    if (!causes) {
      throw e;
    }
    return causes.map((err) => [err.extensions.code as string, err.message]);
  }
}

