pub mod print;
pub mod login;

pub trait Command {
  fn run(&self) { }
}