> 历史 v4 验收记录。最新角色源码版本 0.3.0-character 见 [角色版验收](character-v5-acceptance.md)；以下 Windows exe 结果不能替代新版测试。

# 本地 Godot 技术验收

2026-10-02 UTC；独立分支 `codex/godot-migration`，阶段二基线 `9984fcab6b0291f56b5fdcf90b73a8da72a98d2a`。默认入口 `scenes/main.tscn`，逻辑画布 430×932，Godot `4.7.2.stable.official.ed1daf0bf` / Compatibility。全部运行使用本任务的独立 APPDATA 和 LOCALAPPDATA；没有修改玩家默认存档或 JS 源目录。

新增 Codec / Session / Recovery、本地服务与结算队列，以及真实 Router、原生主界面、模态、社交页、输入门、动画导演、卡牌缓存、偏好和音频。运行不依赖 JS 或 Node。各功能的范围与未接入平台见 [platform-status.md](platform-status.md)。最终角色素材和表演待用户视觉确认，当前不是最终美术验收。

## 自动检查

检查同时要求退出码 0、suite 明确完成，并拒绝日志中的 SCRIPT ERROR / Parse Error；只看到 PASS 不足以验收。

- `tests/run.gd -- --suite all`：24 suites / 15,880 checks / 0 failures，exit 0；日志无 SCRIPT ERROR / Parse Error，含第二个 headless 进程恢复验证。证据 `.execution/acceptance-final-all.log`。此结果在 UI 32 项、Flow 305 项的最后修复与独立批准之后取得。
- `node --test tests/*.test.mjs`：10 tests / 10 pass / 0 fail；包含只读源输出路径防护、junction 防护、确定性 JS oracle、真实脚本错误拒绝、未完成 suite 拒绝、活跃 SceneTree 和异步 suite 等待。
- 270 / 540 / 720 固定关卡各按源开发 receipt 运行，合计 1530 次取牌均到 WON；覆盖层遮挡、侧堆、牌量守恒和源状态 / 事件 oracle。
- 本地荣誉并列 ID 排序独立重算 5906 组 Node / ICU 源向量，全部匹配；冻结 elapsed 与签发 ticket 绑定，accepted-first 幂等仍在过期检查之前。
- 原生通关面板回归：450ms 设置 / 退出不能提前取消；509ms 隐藏，510ms α=0，590ms α=0.5 且按钮禁用，670ms α=1 且合法按钮启用。系统 canceled 触摸 revision 保持不变。

## 事务与故障矩阵

以下为独立 store / clock / callback 故障测试，未把测试状态注入截图中的玩家进度。

| 场景 | 预期 / 实测结果 |
| --- | --- |
| 普通取牌 / 道具写失败 | 不发布、不扣配额；原状态与存档保留。 |
| 外部完成观察写失败 | 内存保留原 EARNED/token，dirty；普通动作和关闭先 flush，失败不继续。 |
| EARNED 兑现前重启 | 第二个真实 headless 进程恢复原 token、日志与 receipts；兑现一次。 |
| 取消观察写失败后回主页 / 新局 | 先 flush；失败保留 PLAY，成功清理后可以开始新局。 |
| 重复 command / callback | 幂等，不多发奖励、道具或业务事件。 |
| 最后取牌已存、outbox 创建失败 | 重启由 active 的原终局重建相同 log / elapsed / payload。 |
| 服务接受后响应丢失 / ack 失败 | 重试原签名，跨午夜仍返回原接受结果，不重复历史或贡献。 |
| active / outbox 部分清理失败 | 保留待结算 gate；重试原 payload，完成两项清理后才解除。 |
| 不同用户 / ticket / deal / elapsed 篡改 | 拒绝；不信客户端直接宣称的 WON。 |
| 未接受旧票据、坏档 / checksum / replay 错误 | 显式错误、保留诊断，不给予奖励或静默回退。 |
| EXPIRED 显示后墙钟回拨 | 清档前冻结并验证时间；未过期时拒绝清档并保留权益。 |
| 显示 / 模态 / 后台暂停叠加 | 单调有效计时；任一暂停原因仍在时不恢复计时。 |
| 正常关闭 dirty Session | 保存失败保持窗口，成功存原证据后允许关闭；clean 不额外写盘。 |

## 原生界面实录

`native-run-2` 使用新独立磁盘存档，输入仅 `Viewport.push_input` 鼠标移动、按下、释放；没有直接调用 reducer / Router 取牌，也没有状态或存档注入。记录 369 步、真实教学 12 张完成、每日侧堆取牌、撤回 / 移出 / 任意暂存回取 / 洗牌、七格失败、一次明示奖励模拟复活、第二次失败与持久化结算、本地记录 / 锁定装扮 / 弹幕 / 设置、完整 UI / Controller 重建后的落盘重载。

另按源开发 receipt 指导 270 次真实界面点击，完成当天实际 daily 到 WON 并保存、解锁 cap；这是自动解法辅助 GUI 验证，不是人工玩家自然通关。装扮最终图仍用相同样张。节点数基线 31，三次重建后均为 31。

原始 PNG 是 Godot `frame_post_draw` 后未经改绘的 Viewport 纹理。MP4 仅编码这些原始帧，按真实 capture 时间保持停留长度：763 帧，实际平均约 4.07 次采样 / 秒，录制时间线约 187.175 秒；输出 10fps 使用原帧重复持有，不声称实际采样 10fps，也不作为产品 FPS 基准。

430×932 主页、教学、真实每日和结算已逐图查看，中文、user-cards 和萝卜显示正常；860×1864 是实际两倍窗口像素，不冒称操作系统 DPR=2。请求 390×720 后，实际 Window client 为 390×720、最小尺寸 64×64；keep-aspect 的有效内容 PNG 为 332×720，逻辑画布仍为 430×932，左右留黑，整个界面完整。原生补充尺寸流程 23 steps / 0 failures，未改绘 PNG 或调整产品 stretch 来满足错误断言。

首次完整重放对 Viewport 必须等于请求 Window 像素的假设失败，原 failed report 保留，核心 369 步均已完成。补充流程区分真实 client 与 Viewport 纹理尺寸并逐图核验；尺寸脚本首次退出记录两个 ObjectDB 诊断，清理 QA 节点后又用新独立存档重跑 23 steps / 0 failures，无 ObjectDB leak 或 SCRIPT ERROR。最终发行 QA 使用修正后的脚本另做新档运行。

## Windows 交付与复现

最终可玩代码本地提交为 `a097f3f7a8be78f103d6d676a7e96c0d4144b767`。Windows 本机构建基于 `e3e76ca36e509dc51bd364c0afa62d4d04c593ab`（仅文档与 UID 跟进），import / export 均 exit 0，无 SCRIPT ERROR / Parse Error。本次完整源码与真实实录已保存至 Library；源码可以用 Godot 4.7.2 直接运行。本机验收包解压运行 `BuLeGeBu.exe`，无需 Node、npm 或编辑器，未公开发行或发布。

本次实际 exe 验收使用全新 `.execution/exe-qa-final-e3e-1/` APPDATA / LOCALAPPDATA，`FLAG_NO_FOCUS`、屏幕外窗口和 Dummy 音频；输入仍仅真实 Viewport 鼠标事件。结果 `ok=true`、exit 0、94 steps、45,804ms、213 原生帧、22 个里程碑，failures 为空，日志无 GDScript 错误、ObjectDB leak 或 resources-in-use 警告。短流程不用测试夹具，包含自然教学通关→每日、侧堆、三个道具、暂存任取、两次失败与一次本地模拟复活、真实结算、社交 / 偏好 / UI 完整重建后的磁盘重载，以及 390×720 / 860×1864 窗口原生截图。主页、真实棋盘与设置画面已实际查看，设置显示不支持震动，浅底图标对比正常。

证据为 `artifacts/runtime/windows-native-final-e3e/report.json`、`.execution/exe-qa-final-e3e-1/engine.log` 与 `.execution/export-final-source-a097.json`。本机 EXE 为 109,268,480 bytes，SHA256 `d34d36f3be1a6c49c56525ae86469b92e4f417ddf0b43cf00dd80c385c4b0562`；最新 PCK SHA256 `4282da2cece0d0205be27c71a662104c51ada92375fa728762a21de6c1e8faac`。许可与本机使用说明随验收包保存，旧初步构建不作为最终包。

审批历史保留：前两次最终构建在进程启动前被拒，审查仅认可最初“只读 JS PR 预览”，不接受后续授权转述。本线程随后提供原始用户创建独立 Godot、确认详细计划、继续推进的原文，并允许同调用重试一次。原构建命令保持，原始授权未写入工具参数；该次获批，之后本机 exe 验收也获批。未换 shell、隐藏操作或规避审查。此前 Windows 阻塞已解除，不需要再叫醒用户请求同一授权。

源码重新导出时，可将同版本官方模板的 `windows_release_x86_64.exe` / `windows_debug_x86_64.exe` 放在项目相邻的 `tools-local/godot-export-4.7.2/`，或在 Godot 安装官方 4.7.2 模板后清空 preset 中的 custom_template 路径。模板与 FFmpeg 用官方 / 官方所链接供应商的 HTTPS Range 取得，各选定文件 CRC32 和本地 SHA256 已校验；完整下载包 hash 未完成校验，未声称完成。

所有失败诊断保留在隔离 `.execution/`，不会作为玩家档打入本机验收包。交付源码不含 `.godot` 缓存、测试用户目录、下载工具或生成录像帧；原生截图 / MP4 另存 Library。无 Github 推送、合并或公开发布。当前技术验收没有已确认的剩余阻塞；最终角色与表演仍等待用户视觉确认。
