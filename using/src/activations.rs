//! Methods to select which of a set of implementations to activate based on a schema's
//! `Request`s.

use crate::{Find, Found, Implementations, Request, Schema};

/// An Activation references a request and contains the min and max versioned implementations
/// available in the implementation registry which can satisfy that request, or None if no
/// matching implementations were available.
// type Activation<'schema, 'impls, T> = (&'schema Request, Find<'impls, T>);

impl<'a> Schema<'a> {
    /// Given a set of implementations, take all requests in the document and
    /// match them to the implementations which satisfy them ("satisfying
    /// implementations").
    ///
    /// This returns an `Iterator` over `(&Request, Find<T>)`.
    /// `Find` is an `Iterator` over `(&Version, &T)`, which will iterate satisfying
    /// implementations ordered by lowest to highest version. The
    /// [`bound`](Bounds.html#bound) method can be used to get the lowest and highest
    /// satisfying versions.
    ///
    /// # Example:
    ///
    /// ```
    /// use using::*;
    ///
    /// let impls = Implementations::new()
    ///     .provide("https://spec.example.com/A", Version(1, 2), "impl for A 1.2")
    ///     .provide("https://spec.example.com/A", Version(1, 3), "impl for A 1.3")
    ///     .provide("https://spec.example.com/A", Version(1, 7), "impl for A 1.7");
    /// let schema = Schema::parse(r#"schema @using(spec: "https://spec.example.com/A/v1.0") { query: Query }"#)?;
    ///
    /// let max = schema
    ///   .activations(&impls)
    ///   .filter_map(|(_request, mut impls)| impls.bounds())
    ///   .collect::<Vec<_>>();
    ///
    /// assert_eq!(max, vec![(
    ///     (&Version(1, 2), &"impl for A 1.2"), (&Version(1, 7), &"impl for A 1.7")
    /// )]);
    /// # Ok::<(), GraphQLParseError>(())
    /// ```
    pub fn activations<'impls, T>(
        &'impls self,
        implementations: &'impls Implementations<T>,
    ) -> impl Iterator<
        Item = (
            &'a Request,
            Find<'impls, T, impl Iterator<Item = Found<'impls, T>>>,
        ),
    > + 'impls
    where
        'impls: 'a,
        T: 'impls,
    {
        self.using
            .iter()
            .map(move |request| (request, implementations.find_req(request)))
    }
}

#[cfg(test)]
mod tests {
    use crate::*;
    use graphql_parser::ParseError;
    use insta::assert_snapshot;

    #[test]
    fn it_iterates_over_activations() -> Result<(), ParseError> {
        assert_snapshot!({
            let implementations = Implementations::new()
                .provide(
                    "https://spec.example.com/A",
                    Version(1, 2),
                    "impl A v1.2".to_owned(),
                )
                .provide(
                    "https://spec.example.com/B",
                    Version(1, 2),
                    "impl B v1.2".to_owned(),
                );

            let schema = Schema::parse(
                r#"
                schema
                    @using(spec: "https://spec.example.com/A/v1.0")
                    @using(spec: "https://spec.example.com/unknown/v1.0")
                {
                    query: Query
                }
                "#,
            )?;

            let activations = schema
                .activations(&implementations)
                .map(|(req, find)| (req, find.collect::<Vec<_>>()))
                .collect::<Vec<_>>();

            format!("{:#?}", activations)
        },
        @r###"
        [
            (
                Request {
                    spec: Spec {
                        identity: "https://spec.example.com/A",
                        default_prefix: "A",
                        version: Version(
                            1,
                            0,
                        ),
                    },
                    prefix: "A",
                    position: Pos(3:21),
                },
                [
                    (
                        Version(
                            1,
                            2,
                        ),
                        "impl A v1.2",
                    ),
                ],
            ),
            (
                Request {
                    spec: Spec {
                        identity: "https://spec.example.com/unknown",
                        default_prefix: "unknown",
                        version: Version(
                            1,
                            0,
                        ),
                    },
                    prefix: "unknown",
                    position: Pos(4:21),
                },
                [],
            ),
        ]
        "###);

        Ok(())
    }

    #[test]
    fn it_takes_arbitrary_types_as_implementations() -> Result<(), ParseError> {
        let implementations = Implementations::new()
            .provide(
                "https://spec.example.com/A",
                Version(1, 2),
                Box::<&dyn Fn() -> String>::new(&|| "impl A v1.2".to_owned()),
            )
            .provide(
                "https://spec.example.com/B",
                Version(1, 2),
                Box::<&dyn Fn() -> String>::new(&|| "impl B v1.2".to_owned()),
            );
        let output = Schema::parse(
            r#"
            schema
                @using(spec: "https://spec.example.com/A/v1.0")
                @using(spec: "https://spec.example.com/unknown/v1.0")
            {
                query: Query
            }
        "#,
        )?
        .activations(&implementations)
        .map(|(_req, find)| find.last().map(|(_ver, f)| f()))
        .collect::<Vec<_>>();

        assert_eq!(output, vec![Some("impl A v1.2".to_owned()), None,]);

        Ok(())
    }
}
