import {
  assert,
  CoreFeature,
  DirectiveDefinition,
  Subgraphs,
  ERRORS,
  SubgraphASTNode,
  didYouMean,
  suggestionList,
  MultiMap,
  Subgraph,
  Directive,
  isDefined,
  printDirectiveDefinition,
} from '@apollo/federation-internals';
import { GraphQLError } from 'graphql';
import { CompositionHint, HINTS } from './hints';
import { MismatchReporter } from './merging/reporter';

type MergeDirectiveItem = {
  sgName: string,
  feature?: CoreFeature,
  directiveName: string,
  directiveNameAs: string,
  composeDirective: Directive, // the directive instance causing the directive to be composed
};

const isSameDirective = (a: DirectiveDefinition, b: DirectiveDefinition) => {
  // same locations
  const locationBSet = new Set(b.locations);
  if (a.locations.length !== b.locations.length) {
    return false;
  }
  if (!a.locations.every(loc => locationBSet.has(loc))) {
    return false;
  }

  // same arguments
  const aArgs = a.arguments();
  const bArgs = b.arguments();
  if (aArgs.length !== bArgs.length) {
    return false;
  }
  for (let i = 0; i < aArgs.length; i += 1) {
    if (aArgs[i].name !== bArgs[i].name) {
      return false;
    }
    if (aArgs[i].type?.toString() !== bArgs[i].type?.toString()) {
      return false;
    }
  }
  return true;
};

/**
 * Return true if the directive from the same core feature has a different name in the subgraph
 * @param subgraph - the subgraph to compare against
 * @param directiveName - the name of directive before renaming
 * @param expectedName - the name of the directive as we expect it to be used
 * @param identity - the identity of the core feature
 *
 * @returns true if the subgraph uses the directive, and it is named differently than expected
 */
const directiveHasDifferentNameInSubgraph = ({
  subgraph,
  origName,
  expectedName,
  identity,
}: {
  subgraph: Subgraph,
  origName: string,
  expectedName: string,
  identity: string,
}): boolean => {
  const imp = subgraph.schema.coreFeatures?.getByIdentity(identity)?.imports?.find(imp => imp.name === `@${origName}`);
  if (!imp) {
    return false;
  }
  const importedName = imp.as ?? imp.name;
  return importedName !== `@${expectedName}`;
};

const allEqual = <T>(arr: T[], cmp: (a: T, b: T) => boolean = (a,b) => a === b) => arr.every((val: T) => cmp(arr[0], val));

type FeatureAndSubgraph = {
  feature: CoreFeature,
  subgraphName: string,
  isComposed: boolean,
};

/**
 * We don't want to allow for composing any of our own features
 */
const DISALLOWED_IDENTITIES = [
  'https://specs.apollo.dev/core',
  'https://specs.apollo.dev/join',
  'https://specs.apollo.dev/link',
  'https://specs.apollo.dev/tag',
  'https://specs.apollo.dev/inaccessible',
  'https://specs.apollo.dev/federation',
];

/**
 * Don't allow directiveNameAs to match any of these reserved names
 */
const RESERVED_NAMES = [
  'join__field',
  'join__graph',
  'join__type',
  'join__implements',
];

export class ComposeDirectiveManager {
  // map of subgraphs to directives being composed
  mergeDirectiveMap: Map<string, Set<string>>;

  // map of identities to the latest CoreFeature+Subgraph it can be found on
  latestFeatureMap: Map<string, [CoreFeature,string]>;

  // map of directive names to identity,origName
  directiveIdentityMap: Map<string, [string,string]>;

  // this is only for directives that are not attached to a core feature
  directiveDefinitionMap: Map<string, DirectiveDefinition>;

  mismatchReporter: MismatchReporter;

  constructor(
    readonly subgraphs: Subgraphs,
    readonly pushError: (error: GraphQLError) => void,
    readonly pushHint: (hint: CompositionHint) => void,
  ) {
    this.mergeDirectiveMap = new Map();
    this.latestFeatureMap = new Map();
    this.directiveIdentityMap = new Map();
    this.directiveDefinitionMap = new Map();
    this.mismatchReporter = new MismatchReporter(subgraphs.names(), pushError, pushHint);
  }

  /**
   * Get from a coreIdentity to a SubgraphASTNode[]
   */
   private coreFeatureASTs(coreIdentity: string): SubgraphASTNode[] {
    return this.subgraphs.values()
      .flatMap(sg => {
        const ast = sg.schema.coreFeatures?.getByIdentity(coreIdentity)?.directive.sourceAST;
        return ast === undefined ? [] : [{ ...ast, subgraph: sg.name }];
      });
  }

  /**
   * If features are compatible (i.e. they have the same major version), return the latest
   * Otherwise return undefined
   */
  private getLatestIfCompatible(coreIdentity: string, subgraphsUsed: string[]): FeatureAndSubgraph | undefined {
    let raisedHint = false;
    const pairs = this.subgraphs.values()
      .map(sg => {
        const feature = sg.schema.coreFeatures?.getByIdentity(coreIdentity);
        if (!feature) {
          return undefined;
        }
        return {
          feature,
          subgraphName: sg.name,
          isComposed: subgraphsUsed.includes(sg.name),
        };
      })
      .filter(isDefined);

    // get the majorVersion iff they are consistent otherwise return undefined
    const latest = pairs.reduce((acc: FeatureAndSubgraph | null | undefined, pair: FeatureAndSubgraph) => {
      // if acc is null, that means that we are on our first element
      // if acc is undefined, that means we have detected a version conflict
      if (acc === null) {
        return pair;
      }
      if (acc === undefined) {
        return acc;
      }
      if (acc.feature.url.version.major !== pair.feature.url.version.major) {
        // if one of the versions is not composed, it's a hint, otherwise an error
        if (acc.isComposed && pair.isComposed) {
          this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
            `Core feature "${coreIdentity}" requested to be merged has major version mismatch across subgraphs`,
            {
              nodes: this.coreFeatureASTs(coreIdentity),
            },
          ));
          return undefined;
        }
        if (!raisedHint) {
          this.pushHint(new CompositionHint(
            HINTS.DIRECTIVE_COMPOSITION_INFO,
            `Non-composed core feature "${coreIdentity}" has major version mismatch across subgraphs`,
            this.coreFeatureASTs(coreIdentity),
          ));
          raisedHint = true;
        }
        return acc.isComposed ? acc : pair;
      }

      // we don't want to return anything as latest unless it is composed
      if (acc.isComposed && !pair.isComposed) {
        return acc;
      } else if (!acc.isComposed && pair.isComposed) {
        return pair;
      }
      return (acc.feature.url.version.minor > pair.feature.url.version.minor) ? acc : pair;
    }, null);

    if (!latest?.isComposed) {
      return undefined;
    }
    return latest;
  }

  private forFederationDirective(sg: Subgraph, composeInstance: Directive, directive: DirectiveDefinition) {
    const directivesComposedByDefault = [
      sg.metadata().tagDirective(),
      sg.metadata().inaccessibleDirective(),
    ].map(d => d.name);
    if (directivesComposedByDefault.includes(directive.name)) {
      this.pushHint(new CompositionHint(
        HINTS.DIRECTIVE_COMPOSITION_INFO,
        `Directive "@${directive.name}" should not be explicitly manually composed since it is a federation directive composed by default`,
        composeInstance.sourceAST ? {
          ...composeInstance.sourceAST,
          subgraph: sg.name,
        } : undefined,
      ));
    } else {
      this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
        `Composing federation directive "${composeInstance.arguments().name}" in subgraph "${sg.name}" is not supported`,
        { nodes: composeInstance.sourceAST },
      ));
    }
  }

  /**
   * In order to ensure that we properly hint or error when there is a major version incompatibility
   * it's important that we collect all used core features, even if the directives within them will not be composed
   * Returns a set of identities
   */
  private allCoreFeaturesUsedBySubgraphs(): Set<string> {
    const identities = new Set<string>();
    this.subgraphs.values().forEach(sg => {
      if (sg.schema.coreFeatures) {
        for (const feature of sg.schema.coreFeatures.allFeatures()) {
          identities.add(feature.url.identity);
        }
      }
    });
    return identities;
  }

  // as part of validation, we want to build directive information from the subgraphs
  private buildMultiMaps() {
    const itemsBySubgraph = new MultiMap<string, MergeDirectiveItem>();
    const itemsByDirectiveName = new MultiMap<string, MergeDirectiveItem>();
    const itemsByOrigDirectiveName = new MultiMap<string, MergeDirectiveItem>();

    // gather default-composed directive names from subgraphs
    const tagNamesInSubgraphs = this.subgraphs.values().map(sg => sg.metadata().federationDirectiveNameInSchema('tag'));
    const inaccessibleNamesInSubgraphs = this.subgraphs.values().map(sg => sg.metadata().federationDirectiveNameInSchema('inaccessible'));

    // iterate over subgraphs to build up the MultiMap's
    for (const sg of this.subgraphs) {
      const composeDirectives = sg.metadata()
        .composeDirective()
        .applications();

      for (const composeInstance of composeDirectives) {
        if (composeInstance.arguments().name[0] !== '@') {
          this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
            `Argument to @composeDirective "${composeInstance.arguments().name}" in subgraph "${sg.name}" must have a leading "@"`,
            { nodes: composeInstance.sourceAST },
          ));
          continue;
        }

        const name = composeInstance.arguments().name.slice(1);

        const directive = sg.schema.directive(name);
        if (directive) {
          const featureDetails = sg.schema.coreFeatures?.sourceFeature(directive);
          const identity = featureDetails?.feature.url.identity ?? '';
          const fromCoreFeature = !!featureDetails;
          let directiveName: string;
          if (fromCoreFeature) {
            directiveName = featureDetails.nameInFeature;
          } else {
            directiveName = name;
          }

          // make sure that core feature is not blacklisted
          if (fromCoreFeature && DISALLOWED_IDENTITIES.includes(identity)) {
            this.forFederationDirective(sg, composeInstance, directive);
          } else if (tagNamesInSubgraphs.includes(name)) {
            const subgraphs: string[] = [];
            this.subgraphs.names().forEach((sg, idx) => {
              if (tagNamesInSubgraphs[idx] === name) {
                subgraphs.push(sg);
              }
            });
            this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
              `Directive "@${name}" in subgraph "${sg.name}" cannot be composed because it conflicts with automatically composed federation directive "@tag". Conflict exists in subgraph(s): (${subgraphs.join(',')})`,
              { nodes: composeInstance.sourceAST },
            ));
          } else if (inaccessibleNamesInSubgraphs.includes(name)) {
            const subgraphs: string[] = [];
            this.subgraphs.names().forEach((sg, idx) => {
              if (inaccessibleNamesInSubgraphs[idx] === name) {
                subgraphs.push(sg);
              }
            });
            this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
              `Directive "@${name}" in subgraph "${sg.name}" cannot be composed because it conflicts with automatically composed federation directive "@inaccessible". Conflict exists in subgraph(s): (${subgraphs.join(',')})`,
              { nodes: composeInstance.sourceAST },
            ));
          } else if (RESERVED_NAMES.includes(name)) {
            this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
              `Directive "@${name}" in subgraph "${sg.name}" cannot be composed because it matches a reserved directive name`,
              { nodes: composeInstance.sourceAST },
            ));
          } else {
            const item = {
              composeDirective: composeInstance,
              sgName: sg.name,
              feature: featureDetails?.feature,
              directiveName,
              directiveNameAs: name,
            };

            itemsBySubgraph.add(sg.name, item);
            itemsByDirectiveName.add(name, item);
            itemsByOrigDirectiveName.add(item.directiveName, item);
          }
        } else {
          const words = suggestionList(`@${name}`, sg.schema.directives().map(d => `@${d.name}`));
          this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
            `Could not find matching directive definition for argument to @composeDirective "@${name}" in subgraph "${sg.name}".${didYouMean(words)}`,
            { nodes: composeInstance.sourceAST },
          ));
        }
      }
    }

    return {
      itemsBySubgraph,
      itemsByDirectiveName,
      itemsByOrigDirectiveName,
    };
  }

  validate() {
    const wontMergeFeatures = new Set<string>();
    const wontMergeDirectiveNames = new Set<string>();

    const {
      itemsBySubgraph,
      itemsByDirectiveName,
      itemsByOrigDirectiveName,
    } = this.buildMultiMaps();

    // for each feature, determine if the versions are compatible
    for (const identity of this.allCoreFeaturesUsedBySubgraphs()) {
      // for the feature, find all subgraphs for which the feature has a directive composed
      const subgraphsUsed = this.subgraphs.values()
        .map(sg => {
          const items = itemsBySubgraph.get(sg.name);
          if (items && items.find(item => item.feature?.url.identity === identity)) {
            return sg.name;
          }
          return undefined;
        })
        .filter(isDefined);

      const latest = this.getLatestIfCompatible(identity, subgraphsUsed);
      if (latest) {
        this.latestFeatureMap.set(identity, [latest.feature, latest.subgraphName]);
      } else {
        wontMergeFeatures.add(identity);
      }
    }

    // ensure that the specified directive is the same in all subgraphs
    for (const [name, items] of itemsByDirectiveName.entries()) {
      if (!allEqual(items.map(item => item.directiveName))) {
        wontMergeDirectiveNames.add(name);
        this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
          `Composed directive "@${name}" does not refer to the same directive in every subgraph`,
          {
            nodes: items.map(item => item.composeDirective.sourceAST).filter(isDefined),
          }
        ));
      }
      if (!allEqual(items.map(item => item.feature?.url.identity))) {
        wontMergeDirectiveNames.add(name);
        this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
          `Composed directive "@${name}" is not linked by the same core feature in every subgraph`,
          {
            nodes: items.map(item => item.composeDirective.sourceAST).filter(isDefined),
          }
        ));
      }
    }

    // ensure that directive is exported with the same name in all subgraphs
    // also check that subgraphs that don't export the directive don't have inconsistent naming.
    for (const [name, items] of itemsByOrigDirectiveName.entries()) {
      if (!allEqual(items.map(item => item.directiveNameAs))) {
        for (const item of items) {
          wontMergeDirectiveNames.add(item.directiveNameAs);
        }

        this.mismatchReporter.reportMismatchErrorWithoutSupergraph(
          ERRORS.DIRECTIVE_COMPOSITION_ERROR,
          'Composed directive is not named consistently in all subgraphs',
          this.subgraphs.values()
            .map(sg => {
              const item = items.find(item => sg.name === item.sgName);
              return item ? {
                item,
                sg,
              } : undefined;
            })
            .map((val) => {
              if (!val) {
                return undefined;
              }
              const sourceAST = val.sg.schema.coreFeatures?.getByIdentity('https://specs.apollo.dev/foo')?.directive.sourceAST;
              return sourceAST ? {
                sourceAST,
                item: val.item,
              } : undefined;
            }),
          (elt) => elt ? `"@${elt.item.directiveNameAs}"` : undefined
        );
      }

      // we know these will be the same in all subgraphs at this point, so just use the first one
      const { directiveName, directiveNameAs } = items[0];
      const feature = items[0].feature;

      // if directive is associated with a core feature, we need to do some additional checks
      if (feature) {
        const nonExportedSubgraphs = this.subgraphs.values()
          .filter(sg => !items.map(item => item.sgName).includes(sg.name));
        const subgraphsWithDifferentNaming = nonExportedSubgraphs.filter(subgraph => directiveHasDifferentNameInSubgraph({
          subgraph,
          origName: directiveName,
          expectedName: directiveNameAs,
          identity: feature.url.identity,
        }));
        if (subgraphsWithDifferentNaming.length > 0) {
          this.pushHint(new CompositionHint(
            HINTS.DIRECTIVE_COMPOSITION_WARN,
            `Composed directive "@${name}" is named differently in a subgraph that doesn't export it. Consistent naming will be required to export it.`,
            subgraphsWithDifferentNaming
              .map((subgraph : Subgraph): SubgraphASTNode | undefined => {
                const ast = subgraph.schema.coreFeatures?.getByIdentity(feature.url.identity)?.directive.sourceAST;
                return ast ? {
                  ...ast,
                  subgraph: subgraph.name,
                } : undefined;
              })
              .filter(isDefined),
          ));
        }
      } else {
        // If directive is not attached to a core feature, we need to ensure the definition is the same everywhere
        const directives = items.map(item => this.subgraphs.get(item.sgName)!.schema.directive(item.directiveName)!);
        if (!allEqual(directives, isSameDirective)) {
          wontMergeDirectiveNames.add(directiveName);
          this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
            `Directive "@${name}" cannot be composed because the definitions are not the same in all subgraphs { ${items.map(item => `"${item.sgName}": "${printDirectiveDefinition(this.subgraphs.get(item.sgName)!.schema.directive(item.directiveName)!)}"`).join(',')} } `,
            { nodes: items[0].composeDirective.sourceAST },
          ));
        } else {
          this.directiveDefinitionMap.set(directiveName, directives[0]);
        }
      }
    }

    // now for anything that wasn't in the blacklist, add it to the map
    for (const [subgraph, items] of itemsBySubgraph.entries()) {
      const directivesForSubgraph = new Set<string>();
      for (const item of items) {
        if ((!item.feature || !wontMergeFeatures.has(item.feature.url.identity)) && !wontMergeDirectiveNames.has(item.directiveNameAs)) {
          directivesForSubgraph.add(item.directiveNameAs);
        }
        if (item.feature) {
          this.directiveIdentityMap.set(item.directiveNameAs, [item.feature.url.identity, item.directiveName]);
        }
      }
      this.mergeDirectiveMap.set(subgraph, directivesForSubgraph);
    }
  }

  shouldComposeDirective({ subgraphName, directiveName }: {
    subgraphName: string,
    directiveName: string,
  }): boolean {
    const sg = this.mergeDirectiveMap.get(subgraphName);
    return !!sg && sg.has(directiveName);
  }

  directiveExistsInSupergraph(directiveName: string): boolean {
    return this.directiveDefinitionMap.has(directiveName) || this.directiveIdentityMap.has(directiveName);
  }

  getLatestDirectiveDefinition(directiveName: string): DirectiveDefinition | undefined {
    if (this.directiveDefinitionMap.has(directiveName)) {
      return this.directiveDefinitionMap.get(directiveName);
    }

    const val = this.directiveIdentityMap.get(directiveName);
    if (val) {
      const [identity, origName] = val;
      const entry = this.latestFeatureMap.get(identity);
      assert(entry, 'core feature identity must exist in map');
      const [feature, subgraphName] = entry;
      const subgraph = this.subgraphs.get(subgraphName);
      assert(subgraph, `subgraph "${subgraphName}" does not exist`);

      // we need to convert from the name that is used in the schemas that export the directive
      // to the name used in the schema that is the latest version, which may or may not export
      // See test "exported directive not imported everywhere. imported with different name"
      const nameInSchema = subgraph.schema.coreFeatures?.getByIdentity(identity)?.directiveNameInSchema(origName);
      if (nameInSchema) {
        const directive = subgraph.schema.directive(nameInSchema);
        if (!directive) {
          this.pushError(ERRORS.DIRECTIVE_COMPOSITION_ERROR.err(
            `Core feature "${identity}" in subgraph "${subgraphName}" does not have a directive definition for "@${directiveName}"`,
            {
              nodes: feature.directive.sourceAST,
            },
          ));
        }
        return directive;
      }
    }
    return undefined;
  }

  private directivesForFeature(identity: string): [string,string][] {
    // TODO: This is inefficient
    const directives: { [key: string]: string} = {};
    for (const [name, val] of this.directiveIdentityMap) {
      const [id, origName] = val;
      if (id === identity) {
        if (!(name in directives)) {
          directives[name] = origName;
        }
      }
    }
    return Object.entries(directives);
  }
  /**
   * Returns all core features, along with the directives referenced from that CoreFeature
   */
  allComposedCoreFeatures(): [CoreFeature, [string,string][]][] {
    return Array.from(this.latestFeatureMap.values())
      .map(value => value[0])
      .filter(feature => !DISALLOWED_IDENTITIES.includes(feature.url.identity))
      .map(feature => ([
        feature,
        this.directivesForFeature(feature.url.identity),
      ]));
  }
}
