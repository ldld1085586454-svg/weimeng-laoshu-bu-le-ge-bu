# 社区原生 PNG 完整映射 v0.9

基于 2022-09-15 的 `qierkang/yang-game` 快照 commit：
`11fe37888add6f44f688f798ede3c6fd612eedc5`。

该快照 `assets/resources/native/` 下实际保留 14 张 PNG：

- 卡牌图集本体：`1bb1ee4cb.e456b.png`，1011×1017，534795 bytes。
- rewardIcon 图集本体：`128b0bdde.4bc94.png`，345×1022，188946 bytes。
- rank 图集本体：`159df0053.c126a.png`，277×1018，39508 bytes。
- `sheep/DJ1`
- `sheep/UI`
- `sheep/Finish1`
- `sheep/BG`
- `sheep/Dead1`
- `sheep/Sheeps`
- `sheep/Alpaca02`
- `sheep/Turnarounds`
- `sheep/ThemeSheeps`
- `sheep/Theme`
- `sheep/Alpaca01`

其中卡牌 / rewardIcon / rank 三张图集在 config 中以内部 texture UUID 依赖存在，没有普通 `paths` 键；其余 11 张均能回映到明确资源键。

完整路径、SHA、字节数见 `community_index/native_png_full_map_v09.csv`。

## 证据等级

全部标记为 **C（社区构建证据）**。它们能证明“该 2022 社区快照包含这些构建资源”，不能自动升级为官方运营交付包，也不能据此推导商用授权。
