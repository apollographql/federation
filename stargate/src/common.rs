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

    /// Where to write the output: to `stdout` or `file`
    #[structopt(default_value = "http://localhost:8080", long)]
    pub address: String,
}

impl Default for Opt {
    fn default() -> Self {
        Opt::from_args()
    }
}
