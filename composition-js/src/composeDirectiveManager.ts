import { assert, CoreFeature, DirectiveDefinition, Subgraphs, ERRORS, SubgraphASTNode, didYouMean, suggestionList, MultiMap } from '@apollo/federation-internals';
import { ASTNode, GraphQLError } from 'graphql';
import { CompositionHint, HINTS } from './hints';

const originalDirectiveName = (directive: DirectiveDefinition, feature: CoreFeature): string => {
  for (const imp of feature.imports) {
    if ( imp.as?.slice(1) === directive.name) {
      return imp.name.slice(1);
    }
  }
  return directive.name;
};

const allEqual = <T>(arr: T[]) => arr.every((val: T) => val === arr[0]);

type FeatureAndSubgraph = {
  feature: CoreFeature,
  subgraphName: string,
  isComposed: boolean,
};

/**
 * We don't want to allow for composing any of our own features
 */
const IDENTITY_BLACKLIST = [
  'https://specs.apollo.dev/core',
  'https://specs.apollo.dev/join',
  'https://specs.apollo.dev/link',
  'https://specs.apollo.dev/tag',
  'https://specs.apollo.dev/inaccessible',
  'https://specs.apollo.dev/federation',
];

/**
 * If features are compatible (i.e. they have the same major version), return the latest
 * Otherwise return undefined
 */
export class ComposeDirectiveManager {
  // map of subgraphs to directives being composed
  mergeDirectiveMap: Map<string, Set<string>>;

  // map of identities to the latest CoreFeature+Subgraph it can be found on
  latestFeatureMap: Map<string, [CoreFeature,string]>;

  // map of directive names to identity
  directiveIdentityMap: Map<string, string>;

  constructor(
    readonly subgraphs: Subgraphs,
    readonly pushError: (error: GraphQLError) => void,
    readonly pushHint: (hint: CompositionHint) => void,
  ) {
    this.mergeDirectiveMap = new Map();
    this.latestFeatureMap = new Map();
    this.directiveIdentityMap = new Map();
  }

  /**
   * Get from a coreIdentity to a SubgraphASTNode[]
   */
  private coreFeatureASTs(coreIdentity: string): SubgraphASTNode[] {
    return this.subgraphs.values()
      .map(sg => {
        const ast = sg.schema.coreFeatures?.getByIdentity(coreIdentity)?.directive.sourceAST;
        return ast === undefined ? undefined : { ast, subgraph: sg.name };
      })
      .filter((result): result is { ast: ASTNode, subgraph: string } => result !== undefined)
      .map(({ ast, subgraph }: { ast: ASTNode, subgraph: string }) => ({
        ...ast,
        subgraph,
      }) as SubgraphASTNode);
  }

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
      .filter((combo): combo is FeatureAndSubgraph => combo !== undefined );

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
          this.pushError(ERRORS.CORE_DIRECTIVE_MERGE_ERROR.err(
            `Core feature "${coreIdentity}" requested to be merged has major version mismatch across subgraphs`,
            {
              nodes: this.coreFeatureASTs(coreIdentity),
            },
          ));
          return undefined;
        }
        if (!raisedHint) {
          this.pushHint(new CompositionHint(
            HINTS.CORE_DIRECTIVE_MERGE_INFO,
            `Non-composed core feature "${coreIdentity}" has major version mismatch`,
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

    if (!latest || !latest.isComposed) {
      return undefined;
    }
    return latest;
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

  validate(): { errors: GraphQLError[], hints: CompositionHint[] } {
    const errors: GraphQLError[] = [];
    const hints: CompositionHint[] = [];
    const wontMergeFeatures = new Set<string>();
    const wontMergeDirectiveNames = new Set<string>();

    type MergeDirectiveItem = {
      sgName: string,
      feature: CoreFeature,
      directiveName: string,
      directiveNameAs: string,
    };

    const itemsBySubgraph = new MultiMap<string, MergeDirectiveItem>();
    const itemsByDirectiveName = new MultiMap<string, MergeDirectiveItem>();
    const itemsByOrigDirectiveName = new MultiMap<string, MergeDirectiveItem>();

    // iterate over subgraphs
    for (const sg of this.subgraphs) {
      const composeDirectives = sg.metadata()
        .composeDirective()
        .applications();

      // TODO: Ensure that all directives conform to the right syntax (i.e. start with @)
      for (const composeInstance of composeDirectives) {
        if (composeInstance.arguments().name[0] !== '@') {
          this.pushError(ERRORS.CORE_DIRECTIVE_MERGE_ERROR.err(
            `Argument to @composeDirective "${composeInstance.arguments().name}" in subgraph "${sg.name}" must have a leading "@"`,
            { nodes: composeInstance.sourceAST },
          ));
          continue;
        }

        const name = composeInstance.arguments().name.slice(1);
        const directive = sg.schema.directive(name);
        if (directive) {
          const feature = sg.schema.coreFeatures?.sourceFeature(directive);
          if (feature) {
            const identity = feature.url.identity;
            // make sure that core feature is not blacklisted
            if (IDENTITY_BLACKLIST.includes(identity)) {
              this.pushHint(new CompositionHint(
                HINTS.CORE_DIRECTIVE_MERGE_INFO,
                `Directive "@${directive.name}" should not be explicitly manually composed since its composition rules are done automatically by federation`,
                {
                  ...composeInstance.sourceAST!, // TODO: Is there an elegant way to get rid of type assertion
                  subgraph: sg.name,
                },
              ));
            } else {
              const item = {
                sgName: sg.name,
                feature,
                directiveName: originalDirectiveName(directive, feature),
                directiveNameAs: name,
              };

              itemsBySubgraph.add(sg.name, item);
              itemsByDirectiveName.add(name, item);
              itemsByOrigDirectiveName.add(item.directiveName, item);
            }
          } else {
            this.pushHint(new CompositionHint(
              HINTS.CORE_DIRECTIVE_MERGE_INFO,
              `Directive "@${name}" in subgraph "${sg.name}" cannot be composed because it is not a member of a core feature`,
              {
                ...composeInstance.sourceAST!, // TODO: Is this safe?
                subgraph: sg.name,
              },
            ));
          }
        } else {
          const words = suggestionList(`@${name}`, sg.schema.directives().map(d => `@${d.name}`));
          this.pushError(ERRORS.CORE_DIRECTIVE_MERGE_ERROR.err(
            `Could not find matching directive definition for argument to @composeDirective "@${name}" in subgraph "${sg.name}".${didYouMean(words)}`,
            { nodes: composeInstance.sourceAST },
          ));
        }
      }
    }

    // for each feature, determine if the versions are compatible
    for (const identity of this.allCoreFeaturesUsedBySubgraphs()) {
      // for the feature, find all subgraphs for which the feature has a directive composed
      const subgraphsUsed = this.subgraphs.values()
        .map(sg => {
          const items = itemsBySubgraph.get(sg.name);
          if (items && items.find(item => item.feature.url.identity === identity)) {
            return sg.name;
          }
          return undefined;
        })
        .filter((name): name is string => name !== undefined);

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
        console.log('directive is not named the same in all subgraphs');
        // TODO: Error
      }
      if (!allEqual(items.map(item => item.feature.url.identity))) {
        wontMergeDirectiveNames.add(name);
        console.log('directive identity is not named the same in all subgraphs');
        // TODO: Error
      }
    }

    // ensure that directive is exported with the same name in all subgraphs
    for (const [name, items] of itemsByOrigDirectiveName.entries()) {
      if (!allEqual(items.map(item => item.directiveNameAs))) {
        for (const item of items) {
          wontMergeDirectiveNames.add(item.directiveNameAs);
        }

        const itemStr = (item: MergeDirectiveItem) => `("${item.sgName}","@${item.directiveNameAs}")`;
        this.pushError(ERRORS.CORE_DIRECTIVE_MERGE_ERROR.err(
          `Composed directive "@${name}" named inconsistently (subgraph, directiveName). ${items.map(item => itemStr(item))}`,
        ));
      }
    }

    // now for anything that wasn't in the blacklist, add it to the map
    for (const [subgraph, items] of itemsBySubgraph.entries()) {
      const directivesForSubgraph = new Set<string>();
      for (const item of items) {
        if (!wontMergeFeatures.has(item.feature.url.identity) && !wontMergeDirectiveNames.has(item.directiveNameAs)) {
          directivesForSubgraph.add(item.directiveNameAs);
        }
        this.directiveIdentityMap.set(item.directiveNameAs, item.feature.url.identity);
      }
      this.mergeDirectiveMap.set(subgraph, directivesForSubgraph);
    }

    return {
      errors,
      hints,
    };
  }

  shouldComposeDirective({ subgraphName, directiveName }: {
    subgraphName: string,
    directiveName: string,
  }): boolean {
    const sg = this.mergeDirectiveMap.get(subgraphName);
    return !!sg && sg.has(directiveName);
  }

  directiveExistsInSupergraph(directiveName: string): boolean {
    return !!this.directiveIdentityMap.get(directiveName);
  }

  getLatestDirectiveDefinition(directiveName: string): DirectiveDefinition | undefined {
    const identity = this.directiveIdentityMap.get(directiveName);
    if (identity) {
      const entry = this.latestFeatureMap.get(identity);
      assert(entry, 'core feature identity must exist in map');
      const [_, subgraphName] = entry;
      const subgraph = this.subgraphs.get(subgraphName);
      assert(subgraph, `subgraph "${subgraphName}" does not exist`);
      return subgraph.schema.directive(directiveName);
    }
    return undefined;
  }

  private directivesForFeature(identity: string): string[] {
    // TODO: This is inefficient
    const directives = new Set<string>();
    for (const [name, id] of this.directiveIdentityMap) {
      if (id === identity) {
        directives.add(name);
      }
    }
    return Array.from(directives);
  }
  /**
   * Returns all core features, along with the directives referenced from that CoreFeature
   */
  allComposedCoreFeatures(): [CoreFeature, string[]][] {
    // TODO: We will have to merge import statements if certain directives are not used in subgraph with latest version
    return Array.from(this.latestFeatureMap.values())
      .map(value => value[0])
      .filter(feature => !IDENTITY_BLACKLIST.includes(feature.url.identity))
      .map(feature => ([
        feature,
        this.directivesForFeature(feature.url.identity),
      ]));
  }
}
