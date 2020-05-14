use structopt::StructOpt;

pub mod pull;
pub mod push;

#[derive(StructOpt)]
pub enum Schema {
    #[structopt(name = "push")]
    Push(push::Push),

    #[structopt(name = "pull")]
    Pull(pull::Pull),
}