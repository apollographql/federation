## Adding a new command

Adding a new command to the Apollo CLI is easy! Most of the work can even be copied from existing commands or from the following example for a simple `do-a-thing` command 🎉

1. Add a struct for it in `commands/mod.rs`. The kebab-case version of the name of this struct and its fields will be your command and flags' names. This struct uses `StructOpt` to build out the names, options, and docs for the CLI. Check out existing commands or the [StructOpt documentation](https://docs.rs/structopt/0.3.13/structopt/) for explantion and usage of StructOpt's many features.

```rust
// commands/mod.rs

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
/// 🎉 This command will do a thing!!
pub struct DoAThing {
    #[structopt(long)]
    /// this flag, if not passed, or passed with `false` will panic the command
    pub test_flag: bool,
}
```

2. Add it to the `Apollo` enum for it in `commands/mod.rs`.

```rust
// commands/mod.rs

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
/// The [Experimental] Apollo CLI, for supporting all your graphql needs :)
pub enum Apollo {
    ...
    /// my command does a thing!
    DoAThing(DoAThing),
}
```

3. Add a module for it in `commands/`. If your command is big and needs multiple files, feel free to give it a directory inside commands. The module will `impl Command for <your-command>`

```rust
// commands/do_a_thing.rs

use crate::commands::Command;
use crate::commands::DoAThing;

impl Command for DoAThing {
  fn run(&self) {
    // implementation here :)
    if self.test_flag == false {
      panic!("aah!");
    }
  }
}
```

4. Add a case for it to the `impl Command for Apollo`, again in `commands/mod.rs`.

```rust
// commands/mod.rs

impl Command for Apollo {
    fn run(&self) {
        match self {
          ...
          Apollo::DoAThing(cmd) => cmd.run(),
        }
    }
}
```

5. Enjoy! Run your command with `cargo run do-a-thing` (the kebab-case version of the struct name).
