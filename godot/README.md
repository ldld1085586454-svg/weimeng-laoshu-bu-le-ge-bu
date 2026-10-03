# 卜了个卜 · Godot 迁移

此目录为独立 GDScript / Godot 4.x 项目（当前源码版本 0.3.1-homefix），参考 PR2 精确提交 `362c61027b7a7f7e573f4b28608e3b3098e2092a`。Godot 源码公开在独立的 `codex/godot-port` 分支 `godot/` 目录；原 JS 项目和 `main` 保留。本项目尚未作为正式产品发布。

当前入口接通真实原生主页、教学、每日/话题对局、奖励模拟、恢复、本地社交和设置。用 Godot 标准版打开 `project.godot` 后运行；首次加入先进入 12 张教学，完成后进入真实每日棋盘。

本版修复首页图标贴边/偏移、弹幕遮挡副标题/进度条和过时功能说明；原图非破坏分层角色继续保留：呼吸、叶冠轻摆、眨眼、点击弹跳、三消/道具反馈、成功/失败/复活、草帽/围巾和荣誉差异。减少动效会关闭角色位移、眨眼和粒子。三消、遮挡、奖励、存档和解锁规则未改。

本轮实际验证为云端 Linux **Godot 4.6.3 official / Compatibility**，28 套 / 15,986 项检查、435 步原生鼠标交互及 6 种窗口尺寸。详见 [首页修复与功能核查](docs/home-fix-acceptance.md)。Windows 修复包使用匹配官方模板重新导出并完成资源包检查，尚未在 Windows 实机运行；旧版 Windows 结果不替代此次验证。微信生产服务仍未接入。

参考资源和许可在 [来源记录](docs/source-provenance.md)、[图标来源](docs/icon-source.md) 及 `assets/` 下。用户萝卜图片不被声明为 CC0；Phosphor Bold 使用 MIT，ZCOOL KuaiLe 使用 OFL。卡牌 T00–T14 保留当前用户资源。

开发检查使用 `tests/test_*.gd`，每个 suite 的 `run(assertions)` 必须在完成后返回 `true`。检查须同时满足退出码 0 和 `PASS <suite>`，不能只看引擎启动成功。测试请使用独立的 APPDATA / LOCALAPPDATA 目录，不污染玩家存档。

```
godot --headless --path . --script tests/run.gd -- --suite deal
```

Node 仅用于一次性素材导入、JS 参考结果和开发检查；产品规则不通过 Node 或 JS 桥接执行。`MIGRATION_SOURCE` 指向只读的原始提交目录后，可运行 `node --test tests/*.test.mjs`。

实际广告、分享、微信登录、云端排名和游戏圈没有接入；奖励弹窗明确标示本地模拟，记录与排名来自本机实际游玩数据。

## 源码发布

本公开副本对应开发提交 `45db158ba685b2f89bcf402b11ceb6391ba791db`，仅整理公开文档、移除开发机绝对路径和私人附件标识，不改变运行时代码、关卡或资产。完整展开源码及许可证均在此目录。发布校验及已知限制见 [源码发布说明](docs/source-publication.md)。
