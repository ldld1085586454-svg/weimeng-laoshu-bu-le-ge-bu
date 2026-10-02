# assets/main 主 UI 图集反解 v0.9

## 新发现
2022-09-15 社区构建的 `assets/main/import/0e/0e316345c.92451.json` 保留了主界面、社交页和弹窗的 Cocos 序列化数据。

本轮从该包中识别出 **134 个 SpriteFrame**。其中主 UI 主要落在四张纹理：

- `14280553b.cc313.png`：789×2048，主按钮、设置、道具、排名背景等。
- `159878452.961d9.png`：635×1592，话题 PK 专用图形。
- `1b5f49aa9.8f1f9.png`：501×940，朋友圈、排行、弹幕、定位等入口图标。
- `1f3fbc33c.9933b.png`：126×654，数字/金币序列。

精确关键帧见 `community_index/main_ui_spriteframes_key_v09.csv`。

## 页面结构不再只靠截图
主包直接出现以下 Prefab 符号：
`topicChoosePopPrefab`、`todayRankPopPrefab`、`firendRankPopPrefab`、`personalPopPrefab`、`bulletScreenPopPrefab`、`winPopPrefab`、`failPopPrefab` 等。

同时存在界面文本：
- 今日朋友圈
- 历史排行榜
- 今日话题
- 昨日的话题PK战
- 换装
- 加入羊群
- 返回羊群
- 通关后将排入羊群

这些属于 **C：2022 社区构建证据**，不是官方交付源码证明，但比单张截图更适合指导 UI 复刻。
