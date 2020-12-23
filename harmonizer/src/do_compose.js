/** @typedef {{typeDefs: string, name: string, url?: string;}} ServiceDefinition */

/**
 * @type {ServiceDefinition[]}
 */
var serviceList = serviceList;

if (!serviceList || !Array.isArray(serviceList)) {
  throw new Error("Error in JSRustland: serviceList missing or incorrect.");
}

serviceList.some((service) => {
  if (
    typeof service.name !== "string" || !service.name ||
    typeof service.url !== "string" && service.url ||
    typeof service.typeDefs !== "string" && service.typeDefs
  ) {
    throw new Error("Missing required data structure on service.");
  }
});

serviceList = serviceList.map(({ typeDefs, ...rest }) => ({
  typeDefs: composition.parseGraphqlDocument(typeDefs),
  ...rest,
}));

/**
 * @type {{ errors: Error[], composedSdl?: undefined } | { errors?: undefined, composedSdl: string; }}
 */
const composed = composition.composeAndValidate(serviceList);

if (typeof composed.errors !== "undefined") {
  print(`There were ${composed.errors.length} composition error(s):`);
  composed.errors.forEach((error, index) => {
    print(`  ${index+1}. ${error}`);
  });
} else if (composed.composedSdl) {
  print("We have composed SDL");
  print(composed.composedSdl);
  done(composed.composedSdl);
}

