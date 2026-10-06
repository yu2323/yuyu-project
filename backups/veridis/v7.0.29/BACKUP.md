# Veridis Rewrite v7.0.29 backup

- Package: `Veridis-Rewrite_手机稳定增强版_v7.0.29_相邻前缀复读修复版.zip`
- Base: `v7.0.28-mobile-stable`
- SHA256: `5827bfb6d6c8a7e7806a4253940696171edd3056bff93f2ee2dc74b333a20f2f`
- Purpose: fix AI write-back prefix replay shaped like `A。\n\nA。B...` or `A。\n\nA，B...`.
- Guard boundary: narration only; adjacent paragraphs only; exact 12–120 char prefix; dialogue preserved; no fuzzy dedupe.
- Regression: 11 text cases + repair idempotence passed.

This folder stores the exact source delta needed to reproduce v7.0.29 from v7.0.28. The original v7.0.28 ZIP is separately retained in the GPT Library / Yuyu Veridis archive.
