import * as shell from "shelljs";
import { run } from "../shell"

run(shell.exec("npm link"));
run(shell.cd("federation-rs-integration"));
run(shell.rm("-rf", "federation-rs"))
