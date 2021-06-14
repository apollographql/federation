import { BuiltIns } from "./definitions";

// TODO: Need a way to deal with the fact that the _Entity type is built after validation.
export class FederationBuiltIns extends BuiltIns {
  protected createBuiltInTypes(): void {
    super.populateBuiltInTypes();
    this.addUnionType('_Entity');
    this.addObjectType('_Service').addField('sdl', this.getType('String'));
    this.addScalarType('_Any');
  }

  protected populateBuiltInDirectives(): void {
    this.addDirective('key')
      .addLocations('OBJECT', 'INTERFACE')
      .addArgument('fields', this.getType('String'));

    this.addDirective('extends')
      .addLocations('OBJECT', 'INTERFACE');

    this.addDirective('external')
      .addLocations('OBJECT', 'FIELD_DEFINITION');

    for (const name of ['requires', 'provides']) {
      this.addDirective(name)
        .addLocations('FIELD_DEFINITION')
        .addArgument('fields', this.getType('String'));
    }

    this.addDirective('inaccessible')
      .addAllLocations();
  }
}

export const federationBuiltIns = new FederationBuiltIns();
