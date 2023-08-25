---
"@apollo/gateway": patch
---

Adds header to change the format of exposed query plans, and allows formatting it as json.

When the gateway is configured to allow it, adding the `Apollo-Query-Plan-Experimental` header to a request already allowed a "prettified" text version of the query plan used for the query is returned in the response extension. This changes adds support for a new (optional) accompanying header, `Apollo-Query-Plan-Experimental-Format`, which can be set to the value "internal" to have the query plan returned as a json object (that correspond to the internal representation of that query plan) instead of the text version otherwise sent. Note that if that new header is not provided, then the query plan continues to be send in the previous prettified text version.
