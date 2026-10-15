# Veridis Rewrite v7.0.31 backup

- Version: `7.0.31-mobile-stable`
- Package: `Veridis-Rewrite_手机稳定增强版_v7.0.31_AI请求硬超时与卡死修复版.zip`
- ZIP SHA256: `16cd5fcbdb15955aa58a29b1ae721400d6176684397340353ce8a6e8f3cd065b`
- Base available in this repository: `backups/veridis/v7.0.29/`
- Cumulative restore patch: `v7.0.29-to-v7.0.31.patch`
- Patch SHA256: `d1cf4fa36df71c6c441e71ef144872931bcb6c0d91897c5a3906e8da5d8cf7a3`

v7.0.31 fixes AI rewrite requests that can leave the sticky `AI 改写中` toast hanging on mobile WebView. The whole rewrite run now shares one deadline; fetch has a hard Promise.race timeout; network timeouts no longer trigger recursive smart-split. JSON/format failures can still smart-split.
