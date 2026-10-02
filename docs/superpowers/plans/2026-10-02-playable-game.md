# 可运行游戏开发实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 按仓库现有 P01—P16 规格交付可运行、可重复构建和可验证的浏览器及微信开发工程，修复真实操作与公开源码验收中的缺口。

**Architecture:** 保留既有算法、product 状态机和共享 Canvas 界面。修复终局持久化与结算恢复；构建仅更新派生文件，不覆盖开发者身份配置；启动时从源码构建主入口。

**Tech Stack:** JavaScript CommonJS、Canvas 2D、Node.js >=22 内置 HTTP/测试、微信小游戏原生接口，无新增运行依赖。

**Spec:** `docs/product/实施计划.md`、`docs/product/全模块交付与验收_v0.12.md`、`docs/product/微信与服务端接入.md`。

## Global Constraints

- `docs/v0.8_algorithm_frozen.json` 和 `docs/product/frozen-v011.json` 中所有源文件逐字节保持不变。
- 沿用 270/540/720 张合成验收关卡、七格三消及既有候选复活规则。
- 不增加充值、金币、体力、商城、Banner、插屏、强制分享或提示答案。
- `config/full-release-gates.json` 保持 development、`publicReleaseAllowed: false`。
- 不把 Node 接口桩与浏览器验证写成微信开发者工具/手机或生产服务验收。
- PNG 目录是文字占位；默认继续使用已有农场图案开发绘制，不冒称最终历史美术。
- 所有临时日志、截图和诊断报告写入 `/tmp` 或被忽略的 `local_reports/`，不提交个人存档和凭据。

## Review Focus

- 网络故障或响应丢失后的同一终局必须可重试，不能被新对局覆盖或重复增加贡献。
- 写入 outbox 失败但终局动作已持久化时，重新加载仍应保留可证明的结算。
- 已通关玩家同日重复挑战应可玩，但通关贡献继续按服务端既有规则去重。
- 重复构建必须保留开发者 AppID 和 SDK 预览配置。
- 公开源码不包含历史归档，完整验收应使用已保留的独立固定基线而非跳过算法回归。

## Task 1: 终局恢复与每日重复挑战

**Files:** 修改 `ui/product/app.js`；测试 `tests/product-ui.test.js` 或独立 `tests/product-recovery.test.js`。

**Interfaces:** 沿用 `createFullApp(canvas, deals, width, height, dpr, options)`、`client.request('settle', payload)` 和 storage 的 `active-round`、`outbox`。恢复原有 ticket、log、elapsedMs，只恢复已证明终局和已领取待兑现奖励，不新增普通 PLAYING 自动续局。

- [x] 添加并运行失败回归：离线终局→重新加载→可见 `retry-settlement`→网络恢复→同一 payload 结算成功；断言旧 payload 未被替换。
- [x] 添加并运行失败回归：只让写入 outbox 失败，保留 active-round 终局；重新加载后可结算。
- [x] 添加并运行回归：服务已接受但响应丢失，重试只增加一次贡献；成功后再次加载不误报待结算。
- [x] 添加并运行失败回归：通关后返回首页再挑战同日同关；重复通关不增加第二只羊。
- [x] 最小修复初始化、终局保存、重试与每日开始分支；保留已过期记录的隔离行为。
- [x] 运行 `node --test tests/product-ui.test.js tests/product-recovery.test.js tests/product-social.test.js`（新增测试文件若采用该名称）。

## Task 2: 可重复构建与公开源码验收

**Files:** 修改 `tools/build-full.js`、`tests/product-build.test.js`、`tests/release-pipeline.test.js`、`tools/full-browser-qa.py`、`tools/full_visual_first.py`；新增固定测试基线 `tests/fixtures/legacy-v07.json`。

**Interfaces:** `node tools/build-full.js` 继续产生同名自包含 HTML 和 `wechat_full/`；保留 AppID、项目自定义设置、preview-config.js；默认安全结构仍由模板定义。

- [x] 先写失败回归：隔离工程中修改 AppID/项目设置/SDK预览，再构建两次，配置保持不变，玩家包无 solver/witness。
- [x] 将 live preview 默认值断言改为验证模板默认值，同时保持生成目录存在及结构正确的检查。
- [x] 固定已批准关卡 cells/dealId/witness 的 SHA-256 基线，记录其来源；算法再生结果和旧式无 snapshotHash 快照验证仍必须通过，不删除或跳过缺归档的测试。
- [x] 将浏览器脚本输出改为可配置、递归创建的 `local_reports/product`；保持原有实际指针验收内容。
- [x] 运行 `node --test tests/product-build.test.js tests/release-pipeline.test.js`；不改冻结算法或发布门禁。

## Task 3: 从源码一键启动与实际运行

**Files:** 修改 `tools/start-full.js`、`package.json`、`tests/product-delivery.test.js`、`README.md`、`README_先读我.md`。

**Interfaces:** 保持 `start()` 返回 Node HTTP Server、默认 `127.0.0.1:8770`、`PORT` 校验及仅本机开发数据；保留所有既有 npm 命令，补 `npm start` 和 `npm run build` 常规入口。

- [x] 添加并运行失败回归：没有生成 HTML 的隔离源码工程运行启动脚本，会先构建后响应 `/`，HTML包含产品入口。
- [x] 实现启动前使用当前 Node 执行 `tools/build-full.js`；构建失败不得启动旧包；保持原有错误与端口处理。
- [x] 更新运行说明，解释改源码后重启会重建、输出/本机数据位置及微信导入入口。
- [x] 全部任务结束后 `npm run full:check`、`npm run full:stress` 和发布门禁检查（预期退出码2）。
- [x] 通过 Playwright 验证真实 HTTP 访问：首页→12张教学→每日棋盘→道具→结算；复活与暂存保留由同一界面的本机模式实际点击验证；验证 API 不可达/重载重试与重复挑战。
- [x] 检查 320×568、390×844、430×932 和桌面视口；记录页面错误与截图；保留开发服务可运行成果。

## 交付核对

- [x] 检查冻结哈希、最终 git diff 和测试结果；独立代码审查后修复重要问题。
- [x] 同步自包含 HTML 与 `wechat_full` 派生源码，不更新原始公开审计清单来冒称同一快照。
- [x] 提供游戏入口、启动命令、实际验证结果及仍需真实微信环境验证的范围。

## 实际验收结果

- `npm run full:check`：323/323 通过，12 个算法文件和包含它们的 20 个旧源文件哈希不变。
- `node tools/full-stress.js`：100 局混合压力流程、5738 条命令；合格关卡 270/540/720 共 1530 次取牌全部胜利并保存重放。混合流程主动制造失败，不是通关率。
- Playwright：35 项本机全流程、23 项实际 HTTP（两轮720张）、9 项合成关卡 API 不可达恢复检查通过；0 未捕获页面异常。
- 独立交付审查及整合审查通过；微信/Windows 真机、最终历史内容与生产部署未验证，发布门禁保持关闭。
