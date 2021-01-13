use std::collections::HashMap;

use graphql_parser::{
    ParseError,
    Pos,
    parse_schema,
    schema::{Document, Definition, Directive},
};

use thiserror::Error;

use crate::{
    Request,
    Version,
    spec,
    constants::{USING_SPEC_URL, USING_VERSIONS, USING_DEFAULT}
};

pub struct Schema<'a> {
    pub document: Document<'a>,
    pub using: Vec<Request>,
    pub errors: Vec<SchemaError>
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SchemaError {
    /// Machine schemas must contain exactly one schema definition.
    #[error("no schema definitions found in document")]
    NoSchemas,

    /// Multiple schema definitions were found in the document
    /// Extra schema definitions are reported as these errors.
    #[error("extra schema definition ignored")]
    ExtraSchema(Pos),

    /// Multiple versions of @using were requested
    /// by the document. One will be selected, the others
    /// will generate these errors.
    #[error("extra using spec ignored")]
    ExtraUsing(Pos, Version),

    /// A request in the document failed to parse.
    #[error("bad using request")]
    BadUsingRequest(Pos, spec::SpecParseError),

    /// Document is using multiple specs with the same prefix.
    #[error("prefixes overlap")]
    OverlappingPrefix(String, Vec<Request>)
}


impl<'a> Schema<'a> {
    pub fn parse(source: &'a str) -> Result<Schema<'a>, ParseError> {
        let document = parse_schema(source)?;
        let mut errors = Vec::new();

        let mut schemas: Vec<_> = document
            .definitions
            .iter()
            .filter_map(|def| match def {
                Definition::Schema(sd) => Some(sd),
                _ => None,
            })
            .collect();

        if schemas.is_empty() {
            errors.push(SchemaError::NoSchemas);
            return Ok(Schema {
                document,
                using: vec![],
                errors
            })
        }
        let schema = schemas.remove(0);
        for extraneous in schemas {
            errors.push(SchemaError::ExtraSchema(extraneous.position));
        }
        
        // Collect everything which could be a using request.
        // "Looks like a using request" means it's a directive
        // on the schema which has a spec: String that parses as a
        // spec URL, and may optionally have a prefix: String.
        //
        // Notably not checked here is the name of the directive.
        // That's because @using might itself be prefixed. We'll filter
        // these candidates down in the subsequent boostrapping phase.
        let mut requests: Vec<_> = schema
            .directives
            .iter()
            .filter_map(|dir|
                // Parse as a using request and retain the directive.
                // This filters out any directives which do not have a spec: argument at all.
                Request::from_directive(dir)
                    .map(|res| (dir, res))
            )
            .collect();
        
        let using_req = bootstrap(&requests, &mut errors);
        
        let mut using = vec!();
        
        for (dir, req) in requests.drain(0..) {
            if dir.name != using_req.prefix { continue }
            match req {
                Ok(req) => using.push(req),
                Err(err) => errors.push(
                    SchemaError::BadUsingRequest(dir.position, err)
                )
            }
        }        

        let mut machined = Schema { document, using, errors };
        machined.validate_no_overlapping_prefixes();
        Ok(machined)
    }    

    fn validate_no_overlapping_prefixes(&mut self) {
        let mut by_prefix = HashMap::<_, u32>::new();
        for req in &self.using {
            let count = by_prefix.entry(req.prefix.clone()).or_default();
            *count = *count + 1;
        }        
        for (prefix, count) in by_prefix.drain() {
            if count > 1 {
                self.errors.push(
                    SchemaError::OverlappingPrefix(
                        prefix.clone(),
                        self.using
                            .drain_filter(|req| req.prefix == *prefix)
                            .collect()
                    )
                );
            }
        }
    }
}

fn bootstrap(requests: &Vec<(&Directive, Result<Request, spec::SpecParseError>)>, errors: &mut Vec<SchemaError>) -> Request {
    let mut bootstraps: Vec<_> = requests.iter()
        // Select only those requests which parsed without error
        .filter_map(|(dir, req)|
            if let Ok(req) = req {
                Some((*dir, req))
            } else {
                None
            }
        )
        .filter(|(dir, req)|
            // We're looking for bootstrap @using directives, so select only
            // those requests whose prefix matches the directive name...
            dir.name == req.prefix &&
            // ...and which are requesting a the using spec...
            req.spec.identity == USING_SPEC_URL &&
            // ...at a supported version.
            USING_VERSIONS.iter().any(
                |ver| ver.satisfies(&req.spec.version)
            )
        )
        .collect();
    
    let using = bootstraps.pop().map(|(_, req)| req).unwrap_or(&*USING_DEFAULT);
    for (dir, unused) in bootstraps {
        errors.push(SchemaError::ExtraUsing(dir.position, unused.spec.version))
    }
    using.clone()
}

#[cfg(test)]
mod tests {
    use crate::{Schema, Request, Spec, Version, SchemaError};
    use graphql_parser::{ParseError, Pos};

    #[test]
    pub fn it_identifies_one_spec() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema
                @using(spec: "https://spec.example.com/A/v1.0")
            {
                query: Query
            }
        "#)?;

        assert_eq!(schema.errors, vec![]);
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "A".to_owned(),
                position: Pos { line: 3, column: 17 },
            }
        ]);

        Ok(())
    }

    #[test]
    pub fn it_identifies_several_specs() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema
                @using(spec: "https://spec.example.com/A/v1.0")
                @using(spec: "https://spec.example.com/B/v0.0", prefix: "specB")
                @using(spec: "https://spec.example.com/C/v21.913")
            {
                query: Query
            }
        "#)?;

        assert_eq!(schema.errors, vec![]);
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "A".to_owned(),
                position: Pos { line: 3, column: 17 },
            },
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/B".to_owned(),
                    default_prefix: "B".to_owned(),
                    version: Version(0, 0),
                },
                prefix: "specB".to_owned(),
                position: Pos { line: 4, column: 17 },
            },
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/C".to_owned(),
                    default_prefix: "C".to_owned(),
                    version: Version(21, 913),
                },
                prefix: "C".to_owned(),
                position: Pos { line: 5, column: 17 },
            },
        ]);

        Ok(())
    }


    #[test]
    pub fn it_can_load_using_with_a_different_prefix() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema
                @req(spec: "https://specs.apollo.dev/using/v0.1", prefix: "req")
                @req(spec: "https://spec.example.com/A/v1.0")
                @using(spec: "https://spec.example.com/B/v2.2")
                {
                    query: Query
                }
        "#)?;

        assert_eq!(schema.errors, Vec::<SchemaError>::new());
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://specs.apollo.dev/using".to_owned(),
                    default_prefix: "using".to_owned(),
                    version: Version(0, 1),
                },
                prefix: "req".to_owned(),
                position: Pos { line: 3, column: 17 },
            },
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "A".to_owned(),
                position: Pos { line: 4, column: 17 },
            }
        ]);

        Ok(())
    }

    #[test]
    pub fn it_errors_when_no_schema_defs_are_present() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            type User {
                id: ID!
            }
        "#)?;
        assert_eq!(schema.errors, vec![
            SchemaError::NoSchemas
        ]);
        assert_eq!(schema.using, vec![]);
        Ok(())
    }    

    #[test]
    pub fn it_errors_when_multiple_schema_defs_are_present() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema
                @using(spec: "https://spec.example.com/A/v2.2")
            {
                query: Query
            }
            
            schema {
                query: Query
            }
        "#)?;

        assert_eq!(schema.errors, vec![
            SchemaError::ExtraSchema(Pos { line: 8, column: 13 })
        ]);
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(2, 2),
                },
                prefix: "A".to_owned(),
                position: Pos { line: 3, column: 17 },
            }
        ]);

        Ok(())
    }

    #[test]
    pub fn it_errors_when_default_prefixes_overlap() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema
                @using(spec: "https://spec.example.com/A/v1.0")
                @using(spec: "https://spec.example.com/B/v2.3")
                @using(spec: "https://somewhere-else.specs.com/A/v1.0")
            {
                query: Query
            }
        "#)?;

        assert_eq!(schema.errors, vec![
            SchemaError::OverlappingPrefix(
                "A".to_owned(),
                vec![
                    Request {
                        spec: Spec {
                            identity: "https://spec.example.com/A".to_owned(),
                            default_prefix: "A".to_owned(),
                            version: Version(1, 0),
                        },
                        prefix: "A".to_owned(),
                        position: Pos { line: 3, column: 17 },
                    },
                    Request {
                        spec: Spec {
                            identity: "https://somewhere-else.specs.com/A".to_owned(),
                            default_prefix: "A".to_owned(),
                            version: Version(1, 0),
                        },
                        prefix: "A".to_owned(),
                        position: Pos { line: 5, column: 17 },
                    }
                ]    
            )
        ]);
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/B".to_owned(),
                    default_prefix: "B".to_owned(),
                    version: Version(2, 3),
                },
                prefix: "B".to_owned(),
                position: Pos { line: 4, column: 17 },
            }
        ]);

        Ok(())
    }

    #[test]
    pub fn it_errors_when_non_default_prefixes_overlap() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema
                @using(spec: "https://spec.example.com/A/v1.0")
                @using(spec: "https://somewhere-else.specs.com/myspec/v1.0", prefix: "A")
            {
                query: Query
            }
        "#)?;

        assert_eq!(schema.errors, vec![
            SchemaError::OverlappingPrefix(
                "A".to_owned(),
                vec![
                    Request {
                        spec: Spec {
                            identity: "https://spec.example.com/A".to_owned(),
                            default_prefix: "A".to_owned(),
                            version: Version(1, 0),
                        },
                        prefix: "A".to_owned(),
                        position: Pos { line: 3, column: 17 },
                    },
                    Request {
                        spec: Spec {
                            identity: "https://somewhere-else.specs.com/myspec".to_owned(),
                            default_prefix: "myspec".to_owned(),
                            version: Version(1, 0),
                        },
                        prefix: "A".to_owned(),
                        position: Pos { line: 4, column: 17 },
                    }
                ]    
            )
        ]);        

        Ok(())
    }

    #[test]
    pub fn it_is_ok_when_prefixes_are_disambugated() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema
                @using(spec: "https://spec.example.com/A/v1.0")
                @using(spec: "https://spec.example.com/B/v2.3")
                @using(spec: "https://somewhere-else.specs.com/A/v1.0", prefix: "otherA")
            {
                query: Query
            }
        "#)?;

        assert_eq!(schema.errors, vec![]);
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "A".to_owned(),
                position: Pos { line: 3, column: 17 },
            },
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/B".to_owned(),
                    default_prefix: "B".to_owned(),
                    version: Version(2, 3),
                },
                prefix: "B".to_owned(),
                position: Pos { line: 4, column: 17 },
            },
            Request {
                spec: Spec {
                    identity: "https://somewhere-else.specs.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "otherA".to_owned(),
                position: Pos { line: 5, column: 17 },
            },            
        ]);

        Ok(())
    }    
}