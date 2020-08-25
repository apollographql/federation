/// The Map trait describes how to convert one tree shape into another (possibly) tree shape.
///
/// This trait is extended by query::Map and schema::Map, which add methods to define the
/// projection from AST nodes to the map's output type.
#[allow(unused_variables)]
pub trait Map {
    type Output;

    /// Merge a child output node and a parent output node.
    /// The default implementation returns the parent output node unchanged
    /// and discards the child output node.
    fn merge(&mut self, parent: Self::Output, child: Self::Output) -> Self::Output {
        parent
    }
}

/// The output of a call to `map` is a Fold.
#[derive(Debug)]
pub struct Fold<M: Map> {
    /// The stack only contains elements while the map operation is in progress.
    /// Specifically, it holds output nodes nodes for every ancestor of the
    /// current node, and is passed to the projection functions.
    pub stack: Vec<M::Output>,

    /// The map being applied.
    pub map: M,

    /// The root output node.
    pub output: Option<M::Output>,
}

impl<M: Map> Fold<M> {
    pub fn pop(&mut self) {
        let output = self.stack.pop();
        if self.stack.is_empty() || output.is_none() {
            self.output = output;
        } else {
            let child = output.expect("bug! is_none is checked above.");
            let parent = self.stack.pop().unwrap();
            self.stack.push(self.map.merge(parent, child));
        }
    }
}

#[macro_export]
macro_rules! visit_each {
    ($visitor:ident : $vec:expr) => {
        for item in $vec.iter() {
            item.accept($visitor);
        }
    };
}

#[macro_export]
macro_rules! node_trait {
    ($visitor:path, $map:path) => {
        pub trait Node {
            fn accept<V: $visitor>(&self, visitor: &mut V);

            fn map<M: $map>(&self, map: M) -> crate::visit::Fold<M> {
                let mut mapping = crate::visit::Fold {
                    stack: vec![],
                    map,
                    output: None,
                };
                self.accept(&mut mapping);
                mapping
            }
        }
    };
}
