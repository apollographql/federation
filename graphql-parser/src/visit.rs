#[macro_export]
macro_rules! visit_each {
    ($visitor:ident : $vec:expr) => (
        for item in $vec.iter() {
            item.accept($visitor);
        }
    )
}
