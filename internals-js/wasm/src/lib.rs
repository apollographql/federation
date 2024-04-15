use wasm_bindgen::prelude::{wasm_bindgen, JsValue};
use js_sys::{Object, Reflect};
use apollo_parser::Parser;

#[wasm_bindgen]
pub fn validate_connect_directives(
    schema: String,
) -> Vec<JsValue> {
    let parser = Parser::new(schema.as_str());
    let cst = parser.parse();
    let mut errors = vec![];
    if cst.errors().len() > 0 {
        for error in cst.errors() {
            let error_object = Object::new();
            Reflect::set(&error_object, &"message".into(), &error.message().into()).unwrap();
            Reflect::set(&error_object, &"index".into(), &error.index().into()).unwrap();
            errors.push(JsValue::from(&error_object));
        }
    }
    errors
}
