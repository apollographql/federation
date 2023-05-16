---
"@apollo/gateway": patch
---

Fix incorrect import the `assert` function in the `DataRewrite.ts`. The incorrect method was imported (due to a bad
import auto-completion) and went unnoticed, leading to potential build issue.
  