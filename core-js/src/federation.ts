import { BuiltIns } from "./definitions";

export class FederationBuiltIns extends BuiltIns {
  protected createBuiltInTypes(): void {
    super.populateBuiltInTypes();
    // TODO: add Entity, which is a union (initially empty, populated later)
    //this.addUnionType('_Entity');
    this.addObjectType('_Service').addField('sdl', this.getType('String'));
    this.addScalarType('_Any');
  }

  protected populateBuiltInDirectives(): void {
    this.addDirective('key');
    this.addDirective('extends');
    this.addDirective('external');
    this.addDirective('requires');
    this.addDirective('provides');
    this.addDirective('inaccessible');
  }
}

export const federationBuiltIns = new FederationBuiltIns();
