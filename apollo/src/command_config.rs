use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
/// The [Experimental] Apollo CLI, for supporting all your graphql needs :)
pub enum Apollo {
    Print(Print),
    Login(Login),
}

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
/// parse and pretty print schemas to stdout
pub struct Print {
    #[structopt(short = "h", long)]
    /// suppress headers when printing multiple files
    pub no_headers: bool,

    #[structopt(parse(from_os_str))]
    /// schemas to print
    pub file: std::vec::Vec<std::path::PathBuf>,
}

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
/// log in to apollo
pub struct Login {}
