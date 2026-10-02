# 游戏界面改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按用户选定的三屏田园参考交付实际可玩的游戏界面与后续统一替换素材的接口。

**Architecture:** Canvas呈现模块与玩法状态分离；统一素材加载器与独立触控状态机供浏览器及微信共用。结算事务不等待动画，结算展示等待最后一组三消完成。

**Tech Stack:** JavaScript CommonJS、Canvas 2D、Node.js22+、微信原生API。

**Spec:** `docs/superpowers/specs/2026-10-02-commercial-ui-design.md`

## Global Constraints

- 保持所有冻结算法文件及真实关卡内容。
- 保留15类牌的玩法语义与3款换装，使用新绘制的田园图集，不加载旧占位图。
- 不引入npm运行依赖、不新增货币商城体力或虚构奖励。
- 保留开发数据与模拟广告披露；不把界面改版声明为生产发布完成。

## Review Focus

- 移动和取消触控不会在释放时误触其他控件。
- 图片损坏、图集越界或加载超时能回到当前素材。
- 最后一次消除遇到网络失败仍保存原成绩，不受动画影响。
- 减少动效、切后台、换屏大小不会留下锁定状态。
- 短屏、安全区和暂存6张不会遮挡或重叠可点击区。

### Task 1: 统一素材接口

Files: `src/product/art-assets.js`, `assets/theme/manifest.json`, `tests/product-art-assets.test.js`, `tools/build-full.js`。

- [x] 写失败用例并运行，验证去重、错误、图集、超时、清理。
- [x] 实现 `createArtAssets(manifest,options)` 的 ready/get/draw/dispose 接口。
- [x] 构建打包语义清单，网页内联与微信安全路径拷贝，并验证实际图片显示。

### Task 2: 界面与交互

Files: `ui/product/input.js`, `ui/product/theme.js`, `ui/product/art.js`, `ui/product/app.js`, `templates/wechat-full/game.js`, `tools/build-full.js`, `tests/product-input.test.js`, `tests/product-presentation.test.js`。

- [x] 输入状态机先测试误触、取消、禁用和多触点再实现。
- [x] 从参考与指定素材提取统一色彩、字体、组件、图标和布局。
- [x] 重做首页、真实棋盘、侧堆、槽、道具、弹窗。
- [x] 最后一组三消先验证延迟展示及减少动效，然后实现动画与结算分离。
- [x] 接入网页/微信按下、移动、释放和取消，保留 tap。

### Task 3: 完整交付

- [x] 执行 `npm run full:check` 及浏览器真实通关与故障恢复。
- [x] 查看参考和实际截图，修复布局、颜色、字体、图标与空间差异；记录真实关卡数据与参考示意的合理差异。
- [x] 独立审查并处理实质问题。
- [x] 更新使用和素材替换说明；交付独立分支、草稿PR和可运行ZIP。
