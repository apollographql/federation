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

        let schema = schemas.pop();
        if schema.is_none() {
            errors.push(SchemaError::NoSchemas);
            return Ok(Schema {
                document,
                using: vec!(),
                errors
            })
        }
        for extraneous in schemas {
            errors.push(SchemaError::ExtraSchema(extraneous.position));
        }
        let schema = schema.expect("schema must exist");
        
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

        Ok(Schema { document, using, errors })
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
    use graphql_parser::ParseError;

    #[test]
    pub fn it_identifies_one_spec() -> Result<(), ParseError> {
        let schema = Schema::parse(r#"
            schema @using(spec: "https://spec.example.com/A/v1.0") {
                query: Query
            }
        "#)?;

        assert_eq!(schema.errors, Vec::<SchemaError>::new());
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "A".to_owned(),
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

        assert_eq!(schema.errors, Vec::<SchemaError>::new());
        assert_eq!(schema.using, vec![
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "A".to_owned(),
            },
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/B".to_owned(),
                    default_prefix: "B".to_owned(),
                    version: Version(0, 0),
                },
                prefix: "specB".to_owned(),
            },
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/C".to_owned(),
                    default_prefix: "C".to_owned(),
                    version: Version(21, 913),
                },
                prefix: "C".to_owned(),
            },
        ]);

        Ok(())
    }


    #[test]
    pub fn it_can_prefix_using() -> Result<(), ParseError> {
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
            },
            Request {
                spec: Spec {
                    identity: "https://spec.example.com/A".to_owned(),
                    default_prefix: "A".to_owned(),
                    version: Version(1, 0),
                },
                prefix: "A".to_owned(),
            }
        ]);

        Ok(())
    }
}