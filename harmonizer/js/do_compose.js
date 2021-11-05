/** @typedef {{sdl: string, name: string, url?: string;}} ServiceDefinition */

/**
 * This `composition` is defined as a global by the runtime we define in Rust.
 * We declare this as a `var` here only to allow the TSDoc type annotation to be
 * applied to it. Running `var` multiple times has no effect.
 * @type {{
 *   composeServices: import('../../composition-js').composeServices,
 *   parseGraphqlDocument: import('graphql').parse
 * }} */
var composition;

/**
 * @type {ServiceDefinition[]}
 */
var serviceList = serviceList;

if (!serviceList || !Array.isArray(serviceList)) {
  throw new Error('Error in JS-Rust-land: serviceList missing or incorrect.');
}

serviceList.some((service) => {
  if (
    typeof service.name !== 'string' ||
    !service.name ||
    (typeof service.url !== 'string' && service.url) ||
    (typeof service.sdl !== 'string' && service.sdl)
  ) {
    throw new Error('Missing required data structure on service.');
  }
});

serviceList = serviceList.map(({ sdl, ...rest }) => ({
  typeDefs: parseTypedefs(sdl),
  ...rest,
}));

function parseTypedefs(source) {
  try {
    return composition.parseGraphqlDocument(source);
  } catch (err) {
    // Return the error in a way that we know how to handle it.
    done({ Err: [err] });
  }
}

try {
  // /**
  //  * @type {{ errors: Error[], supergraphSdl?: undefined, hints: undefined } | { errors?: undefined, supergraphSdl: string, hints: string }}
  //  */
  const composed = composition.composeServices(serviceList);
  done(
    composed.errors
      ? { Err: composed.errors }
      : {
          Ok: {
            supergraphSdl: composed.supergraphSdl,
            hints: composed.hints.map((h) => h.toString()),
          },
        },
  );
} catch (err) {
  done({ Err: [err] });
}
