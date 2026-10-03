# Godot 首轮视觉样张 V1

这是已获实施确认后的**视觉方向审批样张**，不是完成的可玩迁移版或游戏验收。

- 原仓库仅作读取：PR2 head `362c61027b7a7f7e573f4b28608e3b3098e2092a`。所有实现位于独立 Godot 项目；无推送、合并或发布。
- Godot `4.7.2.stable.official.ed1daf0bf`，Compatibility / OpenGL 3.3，原生 viewport `430 × 932`。通过 `Viewport.get_texture().get_image().save_png()` 取得原生渲染输出，未对截图二次绘图。
- 首页使用最新用户提供的橙色萝卜；卡牌使用 PR2 当前 `user-cards.png` 的 T00–T14；背景、字体沿用来源项目。
- 棋盘读取导入的 `deal-270.json` 初始布局，按照遮挡层次展示。槽位和预留区为空，进度 0/270；没有注入玩家通关记录、排名、奖励或假进度。
- 图标统一为 Phosphor Bold 2.1.1，完整 MIT 及来源/hash 在 `docs/icon-source.md`。移出采用 tray-arrow-down，复活映射 heart。

## 萝卜来源与局限

用户原图：`9c96b769a83e2e86db627d64399ad943.jpeg`，Library `[private attachment ID omitted]`，文件 `[private attachment ID omitted]`。SHA-256：`FF092FB6B67DC9F84D7CE111338D5B785F4DE07FC0CD1945CD81EEC91A61AEEB`。

首轮使用既有内置 imagegen 工具清除相册界面、黑边和白底，生成单姿势透明 PNG。没有引入第三方模型服务或付费 API。生成输出保留三束叶、星星眼、笑嘴和粉色舌头；应由用户确认该抠图的外观。它不是逐像素无损抠图，尚未制作服装、失败、荣誉差异姿势或动画。

项目资产：`assets/character/reference-cutout-v1.png`，SHA-256：`6910EE1D6B7BF7FC3A3E2F093DFE86FDD4B8D90A162FC37EFCDF09C3E724C5BC`。用户图片的发布权尚未提供；不声称该素材为 CC0。

## 查看和重新捕获

在本项目目录运行官方 Godot 4.7.2：

```
Godot_v4.7.2-stable_win64_console.exe --path . --rendering-method gl_compatibility --audio-driver Dummy res://preview/visual_sample.tscn -- --capture-samples
```

输出为 `artifacts/visual-samples/godot-home-v1.png` 和 `godot-board-v1.png`。运行时空格可切换两个样张。样张按钮还未接入规则和存储。

下一视觉关卡：用户确认首页/棋盘及抠图方向后，才继续生产角色状态、服装和动画；纯规则任务可以独立推进。
