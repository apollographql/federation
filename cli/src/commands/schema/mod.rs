pub mod check;
pub mod get;
pub mod store;

use structopt::StructOpt;

pub use check::Check;
pub use get::Get;
pub use store::Store;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub enum Schema {
    /// Setup your auth stuff
    /// Requires using an User key which can be found here:
    /// https://engine.apollographql.com/user-settings
    Get(get::Get),
    Store(store::Store),
    Check(check::Check),
}
