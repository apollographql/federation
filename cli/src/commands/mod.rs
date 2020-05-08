pub mod login;
pub mod print;

pub use login::Login;
pub use print::Print;

pub trait Command {
    fn run(self);
}
