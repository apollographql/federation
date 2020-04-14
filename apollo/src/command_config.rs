use structopt::StructOpt;

#[derive(StructOpt)]
/// The [Experimental] Apollo CLI, for supporting all your graphql needs :)
pub enum Apollo {
  #[allow(non_camel_case_types)]
  /// parse and pretty print schemas to stdout
  print {
    /// the input filepath to pretty print
    #[structopt(parse(from_os_str))]
    file: std::vec::Vec<std::path::PathBuf>,
  },
}
