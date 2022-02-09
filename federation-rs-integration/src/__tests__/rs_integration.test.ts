import * as shell from "shelljs";
import { run } from "../shell";

describe('federation-rs tests', () => {
  it('can run cargo xtask test', () => {
    run(shell.exec('git clone https://github.com/apollographql/federation-rs'))
    run(shell.rm("-rf", "federation-rs/target"));
    run(shell.cd("federation-rs/router-bridge"));
    run(shell.exec("npm link @apollo/query-planner"));
    run(shell.cd("../harmonizer-2"));
    run(shell.exec("npm link @apollo/composition"));
    run(shell.cd(".."));
    run(shell.exec("cargo xtask test"));
  })
})
