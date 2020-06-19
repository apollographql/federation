#[macro_export]
macro_rules! visit_each {
    ($visitor:ident : $vec:expr) => (
        for item in $vec.iter() {
            item.accept($visitor);
        }
    )
}

#[allow(unused_variables)]
pub trait Map {
    type Output;
    fn merge(&mut self, parent: Option<Self::Output>, child: &Option<Self::Output>) -> Option<Self::Output> {
        parent
    }
}

#[derive(Debug)]
pub struct Mapping<M: Map> {
    pub stack: Vec<Option<M::Output>>,
    pub map: M,
    pub output: Option<M::Output>,
}

impl<M: Map> Mapping<M> {
    pub fn pop(&mut self) {
        self.output = self.stack.pop().unwrap();        
        if self.stack.is_empty() { return; }
        let parent = self.stack.pop().unwrap();
        self.stack.push(self.map.merge(parent, &self.output));
    }
}
