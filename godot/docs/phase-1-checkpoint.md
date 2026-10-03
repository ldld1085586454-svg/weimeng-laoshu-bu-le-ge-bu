# Godot 独立迁移阶段记录

记录时间：2026-10-02 18:09 UTC。用户已确认实施规格，并要求睡眠期间继续推进已授权的独立工作。原 JS 项目保持只读；没有合并、推送或发布。

## 当前可视成果

已有 `preview/visual_sample.tscn` 原生场景，可切换首页和初始每日棋盘。它们是静态视觉审批样张，**不是已完成的可玩全流程**；按钮尚未接入奖励、存储和本地服务。棋盘采用导入的真实 270 张初始关卡，槽位与预留区为空，没有伪造玩家进度。

Godot 4.7.2 Compatibility 原生 viewport 截图为 430×932，已逐张检查。最新用户萝卜通过内置图像工具清除相册界面和背景，保留单姿势；没有继续无限制作角色变体。Phosphor Bold 同包图标完成，当前用户卡牌 T00–T14 未替换。截图没有重新绘制。

| 成果 | 已确认 Library ID | 已确认文件 ID |
|---|---|---|
| 首页 `godot-home-v1.png` | `[private attachment ID omitted]` | `[private attachment ID omitted]` |
| 初始棋盘 `godot-board-v1.png` | `[private attachment ID omitted]` | `[private attachment ID omitted]` |
| 截图及角色来源说明 | `[private attachment ID omitted]` | `[private attachment ID omitted]` |

首页 PNG SHA-256：`4B5260ADFC6C4EFF64FB2BD133E5FF2D5A43F918A95D78B630BFB1FC705490DE`。棋盘 PNG SHA-256：`14E0F28BBB5A46037F0F0E849ACC22218EAE83AC904146EF11321A595723F1E5`。

## 已实现并复查的规则与基础组件

- Task 1：只读素材/数据导入、来源哈希、关卡验证、遮挡图、JSON 稳定编码及 JS 参考结果导出。测试 runner 要求显式完成和 `PASS <suite>`，真实运行时错误会返回失败。嵌套 junction 输出、缺少 layoutId 和 INT64_MIN 边界已修正。
- Task 2：纯 GDScript BoardReducer，包含取牌、遮挡/侧堆、七格槽、三消胜负、移出、撤回、洗牌、复活追加暂存和不变式。17 个 JS 直接对照场景、1,642 步全部匹配。三个固定关卡的 1,530 步 receipt witness 均到达 WON，属于开发验收回放，不算自然玩家每日通关。
- Task 4 独立基础切片：AtomicStore、ActiveClock。存储使用新文件名的不可变已提交版本，避开 Windows Godot 覆盖改名的删除窗口，保留前一版本；选中的最新文件损坏或不可读会报错，不从旧文件静默恢复。计时支持重叠暂停、恢复基数、新局 reset、单调时间及终局冻结。
- Task 5 独立基础切片：Catalog 的 UTC+8 周期、重置时刻、SHA256 固定关卡选择、教程和配置加载。返回深拷贝，日期/模式/时间范围不合法时明确拒绝。

上述切片均完成独立规格与代码复查，未发现遗留高或中等级问题。28 项来源资源的工作文件与 Git blob 共 56 次 SHA-256 对照全部一致。

## 检查证据

| Godot suite | 单独运行检查数 | 失败 |
|---|---:|---:|
| deal | 140 | 0 |
| canonical | 668 | 0 |
| board | 5,673 | 0 |
| storage | 90 | 0 |
| clock | 17 | 0 |
| catalog | 436 | 0 |

额外 IEEE 数字边界 sweep 8,189 项通过。Node 源码写入防护、参考结果重复导出和运行时错误 runner 回归共 8 项通过。独立审阅也直接与原始 JS 对照了完整棋盘和 Catalog 参考结果。

稳定核心代码检查点为 `c7175d7`。在该提交的独立解压副本完成综合检查，避免把进行中的 Task 3 红测混进稳定检查点：**6 个 suite、7,019 项检查、0 失败，退出码 0，输出 `PASS all`**。单独运行时每个 suite 都有一项“请求 suite 存在”的检查，合并运行只检查一次，因此综合数比表中相加少 5 项。

实际执行：`Godot_v4.7.2-stable_win64_console.exe --headless --path .execution/checkpoint-core-c7175d7 --script tests/run.gd -- --suite all`，APPDATA / LOCALAPPDATA 均指向 `.execution/checkpoint-tests/` 内的独立目录。

本机 Godot 为 `4.7.2.stable.official.ed1daf0bf`。部分隔离配置下出现 Windows 根证书存储读取诊断；离线规则检查不依赖网络证书。此诊断不等于 GDScript 运行时错误，后者由测试 runner 实际拒绝。

## 仍在进行或等待的事项

Task 3 奖励与命令状态机已开始 TDD。RoundCodec、SessionController、RecoveryPolicy、LocalGameService 和 SettlementQueue 还未完成；真实首页→教程→每日→奖励/结算流程与 Windows 导出尚未验收。当前不能把此检查点称为完整可玩迁移版。

唯一需要用户后续选择的当前视觉门是首页/棋盘及萝卜抠图外观。帽子、围巾、失败、荣誉差异姿势和最终动画/全流程素材保留待确认；不依赖该选择的规则和存储测试继续。

Godot 4.7.2 字符串不能保持原始 NUL 或未配对 UTF-16 surrogate；稳定编码已验证当前固定资源及可表示字符串，但不声称任意原始 JS JSON 全兼容。Native 存档也不导入 JS 存档。不可变存储版本在单进程串行写入合同下使用，不额外承诺断电后的硬件持久性；外部删除最新版本无法由枚举辨认。

真实微信登录、广告、分享、开放数据域、云排名及游戏圈未接入或真机验证。它们不阻塞本地迁移，不会代填凭据或自动引入费用。
