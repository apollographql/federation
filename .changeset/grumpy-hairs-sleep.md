---
"@apollo/gateway": patch
---

Fix `fallbackPollIntervalInMs` behavior.

The `fallbackPollIntervalInMs` serves 2 purposes:
* it allows users to provide an Uplink poll interval if Uplink doesn't provide one
* it allows users to use a longer poll interval that what's prescribed by Uplink

The second bullet is how the configuration option is documented, but not how it was previously implemented. This change corrects the behavior to respect this configuration if it's provided AND is longer than the Uplink interval.
  