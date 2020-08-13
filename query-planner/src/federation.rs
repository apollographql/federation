use graphql_parser::query::refs::SelectionSetRef;
use graphql_parser::schema::{Directive, Field, ObjectType, Value};

pub struct FedFieldMetadata {
    service_name: String,
}

impl FedFieldMetadata {
    // from @owner on type, and @resolve on field.
    // but if there are no directives, we need to check the parent. move this stuff to context.
    pub fn service_name(&self) -> String {
        // TODO(ran) FIXME: check if this can be a &str
        self.service_name.clone()
    }

    // only on a field
    pub fn requires<'q>(&self) -> Option<SelectionSetRef<'q>> {
        unimplemented!()
    }

    // only on a field
    pub fn provides<'q>(&self) -> Option<SelectionSetRef<'q>> {
        unimplemented!()
    }

    // only on fields where the parent is a value type.
    pub fn belongs_to_value_type(&self) -> bool {
        unimplemented!()
    }
}

pub struct FedObjectMetadata {
    service_name: String,
}

impl FedObjectMetadata {
    // from @owner on type, and @resolve on field.
    // but if there are no directives, we need to check the parent. move this stuff to context.
    pub fn service_name(&self) -> String {
        // TODO(ran) FIXME: check if this can be a &str
        self.service_name.clone()
    }

    pub fn key<'q>(&self, service_name: &str) -> Option<Vec<SelectionSetRef<'q>>> {
        unimplemented!()
    }

    // every type that is not an entitiy (i.e. a type with an @owner)
    // TODO(ran) FIXME: @trevor to verify this ^^
    // false for fields
    pub fn is_value_type(&self) -> bool {
        unimplemented!()
    }
}

pub fn fed_field_metadata<'q>(
    field_def: &'q Field<'q>,
    parent_type: Option<&'q ObjectType<'q>>,
) -> Option<FedFieldMetadata> {
    match get_directive!(field_def.directives, "resolve").next() {
        Some(d) => Some(FedFieldMetadata {
            service_name: service_name_from_directive(d),
        }),
        None => parent_type
            .and_then(|parent_type| fed_obj_metadata(parent_type).map(|md| md.service_name()))
            .map(|service_name| FedFieldMetadata { service_name }),
    }
}

pub fn fed_obj_metadata<'q>(object_type: &'q ObjectType<'q>) -> Option<FedObjectMetadata> {
    let d = get_directive!(object_type.directives, "owner").next();
    d.map(|d| FedObjectMetadata {
        service_name: service_name_from_directive(d),
    })
}

fn service_name_from_directive(d: &Directive) -> String {
    letp!(Value::String(str) = &d.arguments[0].1 => str.clone())
}
