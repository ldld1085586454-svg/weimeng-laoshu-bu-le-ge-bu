# rewardIcon 与 rank 精确裁剪 v0.7

## 已确认
社区公开构建中三张关键原生图集已定位：
- 卡牌图集：`1bb1ee4cb.e456b.png`（1011×1017）
- rewardIcon 图集：`128b0bdde.4bc94.png`（345×1022）
- rank 图集：`159df0053.c126a.png`（277×1018）

`community_index/reward_spriteframes_exact.csv` 收录当前能从独立 SpriteFrame JSON 直接核实的 6 项裁切；`rank_spriteframes_exact.csv` 收录 10 项排行榜裁切。

## 尚未直接得到裁切 JSON 的 rewardIcon 键
`prop_random`、`prop_life_one`、`reward_video_block`、`reward_video_white` 等键在构建配置中存在，但公开 GitHub code search 没有返回独立 SpriteFrame JSON。因此只标“resource_key_only”，不伪造矩形。

## 使用原则
找到本地合法图集后，可依据精确裁切表导出；没有裁切表的条目先用历史截图/占位图，不写死猜测坐标。
