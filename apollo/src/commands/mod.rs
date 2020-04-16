pub mod login;
pub mod print;

pub trait Command {
    fn run(&self) {}
}
