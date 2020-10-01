use std::path::PathBuf;
use structopt::StructOpt;

#[derive(Debug, StructOpt)]
#[structopt(
    name = "stargate",
    about = "A production ready federation server from Apollo"
)]
pub struct Opt {
    /// Manifest CSDL
    #[structopt(long, parse(from_os_str))]
    pub manifest: PathBuf,

    /// The port to bind on
    #[structopt(default_value = "8080", long)]
    pub port: u32,
}

impl Default for Opt {
    fn default() -> Self {
        Opt::from_args()
    }
}
