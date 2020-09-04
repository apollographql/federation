use serde_json::Value;

pub fn merge(target: &mut Value, source: &Value) {
    if source.is_null() {
        return;
    }

    match (target, source) {
        (&mut Value::Object(ref mut map), &Value::Object(ref source)) => {
            for (key, source_value) in source {
                let target_value = map
                    .entry(key.as_str())
                    .or_insert_with(|| serde_json::Value::Null);

                if !target_value.is_null() && (source_value.is_object() || source_value.is_array())
                {
                    merge(target_value, source_value);
                } else {
                    *target_value = source_value.clone();
                }
            }
        }
        (&mut Value::Array(ref mut array), &Value::Array(ref source)) => {
            for (index, source_value) in source.iter().enumerate() {
                if let Some(target_value) = array.get_mut(index) {
                    if !target_value.is_null() && source_value.is_object() {
                        merge(target_value, source_value);
                    } else {
                        *target_value = source_value.clone();
                    }
                } else {
                    array.push(source_value.clone());
                }
            }
        }
        (a, b) => {
            *a = b.clone();
        }
    }
}

#[cfg(test)]
mod deep_merge_test {
    use super::*;
    #[test]
    fn it_should_merge_objects() {
        let mut first: Value = serde_json::from_str(r#"{"value1":"a","value2":"b"}"#).unwrap();
        let second: Value =
            serde_json::from_str(r#"{"value1":"a","value2":"c","value3":"d"}"#).unwrap();

        merge(&mut first, &second);

        assert_eq!(
            r#"{"value1":"a","value2":"c","value3":"d"}"#,
            first.to_string()
        );
    }
    #[test]
    fn it_should_merge_objects_in_arrays() {
        let mut first: Value =
            serde_json::from_str(r#"[{"value":"a","value2":"a+"},{"value":"b"}]"#).unwrap();
        let second: Value = serde_json::from_str(r#"[{"value":"b"},{"value":"c"}]"#).unwrap();

        merge(&mut first, &second);
        assert_eq!(
            r#"[{"value":"b","value2":"a+"},{"value":"c"}]"#,
            first.to_string()
        );
    }
    #[test]
    fn it_should_merge_nested_objects() {
        let mut first: Value =
            serde_json::from_str(r#"{"a":1,"b":{"someProperty":1,"overwrittenProperty":"clean"}}"#)
                .unwrap();

        let second: Value = serde_json::from_str(
            r#"{"b":{"overwrittenProperty":"dirty","newProperty":"new"},"c":4}"#,
        )
        .unwrap();

        merge(&mut first, &second);

        assert_eq!(
            r#"{"a":1,"b":{"someProperty":1,"overwrittenProperty":"dirty","newProperty":"new"},"c":4}"#,
            first.to_string()
        );
    }
    #[test]
    fn it_should_merge_nested_objects_in_arrays() {
        let mut first: Value = serde_json::from_str(r#"{"a":1,"b":[{"c":1,"d":2}]}"#).unwrap();

        let second: Value = serde_json::from_str(r#"{"e":2,"b":[{"f":3}]}"#).unwrap();

        merge(&mut first, &second);

        assert_eq!(
            r#"{"a":1,"b":[{"c":1,"d":2,"f":3}],"e":2}"#,
            first.to_string()
        );
    }
}
