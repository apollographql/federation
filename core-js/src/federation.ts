import { BuiltIns, Schema } from "./definitions";

// TODO: Need a way to deal with the fact that the _Entity type is built after validation.
export class FederationBuiltIns extends BuiltIns {
  addBuiltInTypes(schema: Schema) {
    super.addBuiltInTypes(schema);

    this.addBuiltInUnion(schema, '_Entity');
    this.addBuiltInObject(schema, '_Service').addField('sdl', schema.stringType());
    this.addBuiltInScalar(schema, '_Any');
  }

  addBuiltInDirectives(schema: Schema) {
    super.addBuiltInDirectives(schema);

    this.addBuiltInDirective(schema, 'key')
      .addLocations('OBJECT', 'INTERFACE')
      .addArgument('fields', schema.stringType());

    this.addBuiltInDirective(schema, 'extends')
      .addLocations('OBJECT', 'INTERFACE');

    this.addBuiltInDirective(schema, 'external')
      .addLocations('OBJECT', 'FIELD_DEFINITION');

    for (const name of ['requires', 'provides']) {
      this.addBuiltInDirective(schema, name)
        .addLocations('FIELD_DEFINITION')
        .addArgument('fields', schema.stringType());
    }

    this.addBuiltInDirective(schema, 'inaccessible')
      .addAllLocations();
  }
}

export const federationBuiltIns = new FederationBuiltIns();
