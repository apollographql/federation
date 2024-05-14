import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { DirectiveDefinition, NonNullType, Schema, isInputType } from "../definitions";
import { DirectiveSpecification, createDirectiveSpecification, createScalarTypeSpecification } from "../directiveAndTypeSpecification";
import { registerKnownFeature } from "../knownCoreFeatures";
import { Subgraph } from '../federation';
import { assert } from '../utils';

export enum ContextDirectiveName {
  CONTEXT = 'context',
  FROM_CONTEXT = 'fromContext',
}

const fieldValueScalar = 'ContextFieldValue';

export class ContextSpecDefinition extends FeatureDefinition {
  public static readonly directiveName = 'context';
  public static readonly identity =
    `https://specs.apollo.dev/${ContextSpecDefinition.directiveName}`;
  public readonly contextDirectiveSpec: DirectiveSpecification;
  public readonly fromContextDirectiveSpec: DirectiveSpecification;

  constructor(version: FeatureVersion) {
    super(
      new FeatureUrl(
        ContextSpecDefinition.identity,
        ContextSpecDefinition.directiveName,
        version,
      )
    );

    this.registerType(createScalarTypeSpecification({ name: fieldValueScalar }));
    
    this.contextDirectiveSpec = createDirectiveSpecification({
      name: ContextDirectiveName.CONTEXT,
      locations: [DirectiveLocation.INTERFACE, DirectiveLocation.OBJECT, DirectiveLocation.UNION],
      args: [{ name: 'name', type: (schema) => new NonNullType(schema.stringType())}],
      composes: true,
      repeatable: true,
      supergraphSpecification: (fedVersion) => CONTEXT_VERSIONS.getMinimumRequiredVersion(fedVersion),
      staticArgumentTransform: (subgraph: Subgraph, args: {[key: string]: any}) => {
        const subgraphName = subgraph.name;
        return {
          name: `${subgraphName}__${args.name}`,
        }; 
      },
    });
    
    this.fromContextDirectiveSpec = createDirectiveSpecification({
      name: ContextDirectiveName.FROM_CONTEXT,
      locations: [DirectiveLocation.ARGUMENT_DEFINITION],
      args: [{ name: 'field', type: (schema, feature) => {
        assert(feature, "Shouldn't be added without being attached to a @link spec");
        const fieldValue = feature.typeNameInSchema(fieldValueScalar);
        const fieldValueType = schema.type(fieldValue);
        assert(fieldValueType, () => `Expected "${fieldValue}" to be defined`);
        assert(isInputType(fieldValueType), `Expected "${fieldValue}" to be an input type`);
        return fieldValueType;
      }}],
      composes: false,
    });
    
    this.registerDirective(this.contextDirectiveSpec);
    this.registerDirective(this.fromContextDirectiveSpec);
  }

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
  
  contextDirective(schema: Schema): DirectiveDefinition<{ name: string }> | undefined {
    return this.directive(schema, ContextSpecDefinition.directiveName);
  }
}

export const CONTEXT_VERSIONS =
  new FeatureDefinitions<ContextSpecDefinition>(
    ContextSpecDefinition.identity
  ).add(new ContextSpecDefinition(new FeatureVersion(0, 1)));

registerKnownFeature(CONTEXT_VERSIONS);
