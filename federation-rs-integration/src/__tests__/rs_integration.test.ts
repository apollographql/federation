import { exec, cd } from "../shell";
import * as path from "path";

describe('federation-rs tests', () => {
  it('can run cargo xtask test', () => {
    assertInDir("federation");

    try {
      cd("federation-rs")
    } catch {
      exec("git clone https://github.com/apollographql/federation-rs")
      cd("federation-rs")
    }

    assertInDir("federation-rs")
    exec("git fetch")
    exec("git checkout main")
    exec("git pull")

    cd("router-bridge");
    exec(`npm exec --yes -- json -f package.json -I -e 'this["dependencies"]["@apollo/query-planner"]="file:../../query-planner-js"'`)
    exec(`npm ci`)
    cd("../harmonizer-2");
    exec(`npm exec --yes -- json -f package.json -I -e 'this["dependencies"]["@apollo/composition"]="file:../../composition-js"'`)
    exec(`npm ci`)
    cd("..");
    assertInDir("federation-rs")
    exec("cargo build --workspace");
    exec("cargo xtask test");
  })
})

function assertInDir(dirname: string) {
  if(process.cwd().split(path.sep).pop() != dirname) {
    throw new Error(`Current working directory not \`${dirname}\``)
  }
}
