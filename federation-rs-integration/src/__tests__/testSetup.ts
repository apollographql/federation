import { exec, cd } from "../shell"

exec("lerna link");
cd("federation-rs-integration");
