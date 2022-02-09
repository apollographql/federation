import * as shell from "shelljs"

export function cd(dir: string) {
  const out = shell.cd(dir)
  check_for_failure(`cd ${dir}`, out)
}

export function exec(command: string) {
  const out = shell.exec(command)
  check_for_failure(command, out)
}

function check_for_failure(command: string, output: shell.ShellString) {
  if (output.code != 0) {
    throw new Error(`\`${command}\` failed with output:\n${output.stdout}\n${output.stderr}`)
  }
}

