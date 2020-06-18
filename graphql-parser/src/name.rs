pub trait Name<'a> {
  fn name(&self) -> Option<&'a str> { None }
}
