// TODO(ran) FIXME: revisit because it seems like 99% of the time there's a name and an Option is unwrapped.
pub trait Name<'a> {
    fn name(&self) -> Option<&'a str> {
        None
    }
}
