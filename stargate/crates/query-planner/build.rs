use std::fs::{read_dir, read_to_string, write};
use std::path::PathBuf;

use harmonizer::{harmonize, ServiceDefinition};

/// This test looks over all directories under tests/features and finds "csdl.graphql" in
/// each of those directories. It runs all of the .feature cases in that directory against that schema.
/// To add test cases against new schemas, create a sub directory under "features" with the new schema
/// and new .feature files.
fn main() {
    // If debugging with IJ, use `read_dir("query-planner/tests/features")`
    // let dirs = read_dir("query-planner/tests/features")
    let dirs =
        read_dir(PathBuf::from("tests").join("features"))
            .expect("read features dir")
            .map(|res| res.map(|e| e.path()).unwrap())
            .filter(|d| d.is_dir());

    for dir in dirs {
        write_composed_schema(&dir).expect("composition");
        // write_tests(dir)?;
    }
    println!("cargo:rerun-if-changed=build.rs");
}

fn write_composed_schema(dir: &PathBuf) -> std::io::Result<()> {
    let schema_paths = read_dir(dir)
        .unwrap()
        .map(|res| res.map(|e| e.path()).unwrap())
        .filter(|e| {
            match (e.extension(), e.file_name()) {
                (Some(ext), Some(name)) =>
                    name != "schema.graphql" && ext == "graphql",
                _ => false,
            }
        })
        .map(|path| ServiceDefinition {
            name: path.file_stem().expect("input schema should have a file stem")
                .to_str()
                .expect("file path to string")
                .to_owned(),
            type_defs: read_to_string(path)
                // .map(|src| {
                //     // for line in src.split("\n") {
                //     //     println!("cargo:warning={}", line);
                //     // }
                //     println!("{}", &src);
                //     src
                // })
                .expect("reading input schema"),
            url: "undefined".to_owned(),
        });

    let composed = harmonize(schema_paths.collect());
    use harmonizer::Result::*;
    match composed {
        Ok(schema) => write(dir.join("schema.graphql"), schema),
        Err(errors) => {
            let mut message = String::new();
            for err in &errors {
                message.push_str(&err.message);
                message.push('\n');
            }
            panic!(message);
        }
    }
}

//
// use gherkin_rust::Feature;
// use gherkin_rust::StepType;
//

// macro_rules! get_step {
//     ($scenario:ident, $typ:pat) => {
//         $scenario
//             .steps
//             .iter()
//             .find(|s| matches!(s.ty, $typ))
//             .unwrap()
//             .docstring
//             .as_ref()
//             .unwrap()
//     };
// }

// fn write_tests(dir: &PathBuf) -> io::Result<()> {
//         let schema = read_to_string(dir.join("csdl.graphql")).unwrap();
//         let planner = QueryPlanner::new(&schema);
//         let feature_paths = read_dir(dir)
//             .unwrap()
//             .map(|res| res.map(|e| e.path()).unwrap())
//             .filter(|e| {
//                 if let Some(d) = e.extension() {
//                     d == "feature"
//                 } else {
//                     false
//                 }
//             });

//         for path in feature_paths {
//             let feature = read_to_string(&path).unwrap();

//             let feature = match Feature::parse(feature) {
//                 Result::Ok(feature) => feature,
//                 Result::Err(e) => panic!("Unparseable .feature file {:?} -- {}", &path, e),
//             };

//             for scenario in feature.scenarios {
//                 let query: &str = get_step!(scenario, StepType::Given);
//                 let expected_str: &str = get_step!(scenario, StepType::Then);
//                 let expected: QueryPlan = serde_json::from_str(&expected_str).unwrap();

//                 let auto_fragmentization = scenario
//                     .steps
//                     .iter()
//                     .any(|s| matches!(s.ty, StepType::When));
//                 let options = QueryPlanningOptionsBuilder::default()
//                     .auto_fragmentization(auto_fragmentization)
//                     .build()
//                     .unwrap();
//                 let result = planner.plan(query, options).unwrap();
//                 assert_eq!(result, expected);
//             }
//         }
//     }
// }