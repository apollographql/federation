//! A set of spec implementations stored for easy lookup with
//! [`Schema.activations`](Schema.html#activations).

use std::collections::{BTreeMap, HashMap};

use crate::{Request, Version};

/// Implementations stores a set of implementations indexed by
/// spec identity and version.
pub struct Implementations<T>(HashMap<String, BTreeMap<Version, T>>);

impl<T> Implementations<T> {
    pub fn new() -> Self {
        Implementations(HashMap::new())
    }
    pub fn provide<S: ToString>(
        mut self,
        identity: S,
        version: Version,
        implementation: T,
    ) -> Self {
        self.0
            .entry(identity.to_string())
            .or_default()
            .entry(version)
            .or_insert(implementation);
        self
    }
}

impl<T> Default for Implementations<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Find an implementation of type T.
pub trait Find<T> {
    /// Find the highest-versioned implementation which can satisfy a
    /// given (identity, version) pair
    fn find_max<S: AsRef<str>>(&self, identity: S, version: &Version) -> Option<(&Version, &T)>;

    /// Find the lowest-versioned implementation which can satisfy a
    /// given (identity, version) pair
    fn find_min<S: AsRef<str>>(&self, identity: S, version: &Version) -> Option<(&Version, &T)>;

    // Find the highest-versioned implementation which can satisfy a `Request`
    fn find_max_req(&self, request: &Request) -> Option<(&Version, &T)> {
        self.find_max(&request.spec.identity, &request.spec.version)
    }

    // Find the lowest-versioned implementation which can satisfy a `Request`
    fn find_min_req(&self, request: &Request) -> Option<(&Version, &T)> {
        self.find_max(&request.spec.identity, &request.spec.version)
    }
}

impl<T> Find<T> for Implementations<T> {
    fn find_max<S: AsRef<str>>(&self, identity: S, version: &Version) -> Option<(&Version, &T)> {
        self.0
            .get(identity.as_ref())?
            .range(version..&Version(version.0, u64::MAX))
            .rev()
            .filter(|(impl_version, _impl)| impl_version.satisfies(version))
            .take(1)
            .collect::<Vec<_>>()
            .pop()
    }

    fn find_min<S: AsRef<str>>(&self, identity: S, version: &Version) -> Option<(&Version, &T)> {
        self.0
            .get(identity.as_ref())?
            .range(version..&Version(version.0, u64::MAX))
            .filter(|(impl_version, _impl)| impl_version.satisfies(version))
            .take(1)
            .collect::<Vec<_>>()
            .pop()
    }
}

#[cfg(test)]
mod tests {
    use super::{Find, Implementations};
    use crate::Version;

    #[test]
    fn it_finds_exact_matches() {
        let identity = "https://spec.example.com/specA";
        let impls = Implementations::new()
            .provide(identity, Version(0, 9), "too small")
            .provide(identity, Version(1, 0), "Specification A")
            .provide(identity, Version(2, 0), "too big");
        assert_eq!(
            impls.find_max(&identity, &Version(1, 0)),
            Some((&Version(1, 0), &"Specification A"))
        );
        assert_eq!(
            impls.find_min(&identity, &Version(1, 0)),
            Some((&Version(1, 0), &"Specification A"))
        );
    }

    #[test]
    fn it_finds_satisfying_matches() {
        let identity = "https://spec.example.com/specA";
        let impls = Implementations::new()
            .provide(identity, Version(0, 9), "too small")
            .provide(identity, Version(2, 99), "2.99")
            .provide(identity, Version(1, 0), "1.0")
            .provide(identity, Version(1, 2), "1.2")
            .provide(identity, Version(1, 3), "1.3")
            .provide(identity, Version(1, 5), "1.5")
            .provide(identity, Version(2, 0), "2.0");
        assert_eq!(
            impls.find_max(&identity, &Version(1, 0)),
            Some((&Version(1, 5), &"1.5"))
        );
        assert_eq!(
            impls.find_min(&identity, &Version(2, 1)),
            Some((&Version(2, 99), &"2.99"))
        );
    }

    #[test]
    fn it_ignores_unrelated_specs() {
        let identity = "https://spec.example.com/specA";
        let unrelated = "https://spec.example.com/B";
        let impls = Implementations::new()
            .provide(identity, Version(0, 9), "too small")
            .provide(identity, Version(2, 99), "2.99")
            .provide(unrelated, Version(1, 3), "1.3")
            .provide(identity, Version(1, 0), "1.0")
            .provide(unrelated, Version(1, 2), "1.2")
            .provide(identity, Version(1, 2), "1.2")
            .provide(unrelated, Version(1, 5), "1.5")
            .provide(identity, Version(1, 3), "1.3")
            .provide(identity, Version(1, 5), "1.5")
            .provide(unrelated, Version(2, 0), "2.0")
            .provide(identity, Version(2, 0), "2.0");
        assert_eq!(
            impls.find_max(&identity, &Version(1, 0)),
            Some((&Version(1, 5), &"1.5"))
        );
        assert_eq!(
            impls.find_min(&identity, &Version(2, 1)),
            Some((&Version(2, 99), &"2.99"))
        );
    }

    #[test]
    fn it_treats_each_zerodot_version_as_mutually_incompatible() {
        let identity = "https://spec.example.com/specA";
        let impls = Implementations::new()
            .provide(identity, Version(0, 0), "0.0")
            .provide(identity, Version(0, 1), "0.1")
            .provide(identity, Version(0, 2), "0.0")
            .provide(identity, Version(0, 3), "0.1")
            .provide(identity, Version(0, 99), "0.99");
        assert_eq!(
            impls.find_max(&identity, &Version(0, 1)),
            Some((&Version(0, 1), &"0.1"))
        );
        assert_eq!(
            impls.find_min(&identity, &Version(0, 99)),
            Some((&Version(0, 99), &"0.99"))
        );
        assert_eq!(
            impls.find_min(&identity, &Version(0, 1)),
            Some((&Version(0, 1), &"0.1"))
        );
        assert_eq!(
            impls.find_max(&identity, &Version(0, 99)),
            Some((&Version(0, 99), &"0.99"))
        );
    }
}
