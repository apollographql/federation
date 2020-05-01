pub mod login;

pub use login::Login;

pub trait Command {
    fn run(self);
}
