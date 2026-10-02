# rewardIcon 缺失元数据结论 v0.9

`rewardIcon` 图集 PNG 本体已经确认存在：

- 文件：`assets/resources/native/12/128b0bdde.4bc94.png`
- 尺寸：345×1022
- SHA：`cb16e5bff20fa2672051ca9b6e495b96f39f3f77`

当前仓库保留了部分 SpriteFrame JSON，因此可精确恢复：

- `prop_remove`
- `prop_cancel`
- `prop_life_remove`
- `prop_nolimit`
- `reward_share_black`
- `reward_share_white`

但配置中还声明：
- `prop_random`
- `prop_life_one`
- `Life_S2`
- `reward_video_block`
- `reward_video_white`
- `rewardIcon`
- 以及 coin/fish 等其他 reward 图标

这些条目的独立 SpriteFrame import JSON 在两个已核对的 2022 快照中均未保留，因此**不能从当前公开文件链精确恢复其 rect / rotated / offset**。

结论：
- `prop_random` 的“图集归属”= C 已确认；
- `prop_random` 的“精确裁切”= U；
- 禁止用目测坐标写入 verified 表。
