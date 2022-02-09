import * as shell from "shelljs"

export function run(shell_output: shell.ShellString) {
  if (shell_output.code != 0) {
    throw new Error(`federation-rs integration tests failed: command exited with code ${shell_output.code}`)
  }
}
