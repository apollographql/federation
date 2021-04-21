import { GraphQLRequest, VariableValues } from "apollo-server-core";

function serializeFetchParameter(p: VariableValues, label: string) {
  let serialized;
  try {
      serialized = JSON.stringify(p);
  } catch (e) {
      const parseError = new Error(
          `Network request failed. ${label} is not serializable: ${e.message}`
      );
      throw parseError;
  }
  return serialized;
};

export function rewriteURIForGET(chosenURI: string, request: GraphQLRequest) {
  // Implement the standard HTTP GET serialization, plus 'extensions'. Note
  // the extra level of JSON serialization!
  const queryParams: string[] = [];
  const addQueryParam = (key: string, value: string) => {
      queryParams.push(`${key}=${encodeURIComponent(value)}`);
  };

  if (request.query) {
      addQueryParam("query", request.query);
  }
  if (request.operationName) {
      addQueryParam("operationName", request.operationName);
  }
  if (request.variables) {
      let serializedVariables;
      try {
          serializedVariables = serializeFetchParameter(
              request.variables,
              "Variables map"
          );
      } catch (parseError) {
          return { parseError };
      }
      addQueryParam("variables", serializedVariables);
  }
  if (request.extensions) {
      let serializedExtensions;
      try {
          serializedExtensions = serializeFetchParameter(
              request.extensions,
              "Extensions map"
          );
      } catch (parseError) {
          return { parseError };
      }
      addQueryParam("extensions", serializedExtensions);
  }
  // Reconstruct the URI with added query params.
  //     This assumes that the URI is well-formed and that it doesn't
  //     already contain any of these query params. We could instead use the
  //     URL API and take a polyfill (whatwg-url@6) for older browsers that
  //     don't support URLSearchParams. Note that some browsers (and
  //     versions of whatwg-url) support URL but not URLSearchParams!
  let fragment = "";
  let preFragment = chosenURI;
  const fragmentStart = chosenURI.indexOf("#");
  if (fragmentStart !== -1) {
      fragment = chosenURI.substr(fragmentStart);
      preFragment = chosenURI.substr(0, fragmentStart);
  }
  const queryParamsPrefix = preFragment.indexOf("?") === -1 ? "?" : "&";
  const newURI =
      preFragment + queryParamsPrefix + queryParams.join("&") + fragment;
  return { newURI };
}
