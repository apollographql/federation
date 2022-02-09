import { exec, cd } from "../shell";
import * as path from "path";

describe('federation-rs tests', () => {
  it('can run cargo xtask test', () => {
    try {
      cd("federation-rs")
    } catch {
      exec('git clone https://github.com/apollographql/federation-rs')
      cd("federation-rs")
    }
    exec("git pull")

    if (process.cwd().split(path.sep).pop() != "federation-rs") {
      throw new Error("Current working directory is somehow not the federation-rs repository")
    }
    cd("router-bridge");
    exec("npm link @apollo/query-planner");
    cd("../harmonizer-2");
    exec("npm link @apollo/composition");
    cd("..");
    exec("cargo xtask test");
  })
})
