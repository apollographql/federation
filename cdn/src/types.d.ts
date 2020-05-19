import { KVNamespace } from "@cloudflare/workers-types";

declare global {
  // Get the key from the "DSN" at: https://sentry.io/settings/<org>/projects/<project>/keys/
  // The "DSN" will be in the form: https://<SENTRY_KEY>@sentry.io/<SENTRY_PROJECT_ID>
  // eg, https://0000aaaa1111bbbb2222cccc3333dddd@sentry.io/123456
  const SENTRY_PROJECT_ID: string;
  const SENTRY_KEY: string;
  // https://docs.sentry.io/error-reporting/configuration/?platform=javascript#release
  // A string describing the version of the release – we just use: git rev-parse --verify HEAD
  // You can use this to associate files/source-maps: https://docs.sentry.io/cli/releases/#upload-files
  // const SENTRY_RELEASE: string
  const SEGMENT_API_KEY: string;
}
