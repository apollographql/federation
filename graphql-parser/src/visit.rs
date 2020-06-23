/// The Map trait describes how to convert one tree shape into another (possibly) tree shape.
///
/// This trait is extended by query::Map and schema::Map, which add methods to define the
/// projection from AST nodes to the map's output type.
#[allow(unused_variables)]
pub trait Map {
    type Output;

    /// Merge a child output node into a parent output node.
    ///
    /// Implementing this method lets you update and/or replace parent nodes
    /// by including data from their children. The default implementation returns
    /// the parent output node unchanged.
    fn merge(&mut self, parent: Self::Output, child: &Self::Output) -> Self::Output {
        parent
    }
}

/// The output of a call to `map` is a Mappping
#[derive(Debug)]
pub struct Mapping<M: Map> {
    /// The stack only contains elements while the map operation is in progress.
    /// Specifically, it holds output nodes nodes for every ancestor of the
    /// current node, and is passed to the projection functions.
    pub stack: Vec<M::Output>,

    /// The map being applied.
    pub map: M,

    /// The root output node.
    pub output: Option<M::Output>,
}

impl<M: Map> Mapping<M> {
    pub fn pop(&mut self) {
        self.output = self.stack.pop();
        if self.stack.is_empty() {
            return;
        }
        if let Some(ref child) = self.output {
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
