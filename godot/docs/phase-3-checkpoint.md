# 阶段三：真实流程代码检查点

2026-10-02，基于阶段二 commit `9984fcab6b0291f56b5fdcf90b73a8da72a98d2a` 的历史新增代码快照，曾保存为原 Library 项目的 version 1。此页保留当时的状态；后续修复、最终计数、原生实录和 Windows 包以 [验收记录](acceptance.md) 为准。此项目未发布，最终美术仍待用户确认。

新增 Session/Codec/恢复、本地服务与持久化结算队列、InputGate、AnimationDirector、ThemeAssets/TileView、Preferences/AudioDirector，以及真实 Router、PlayPresenter、SocialPresenter、ModalPresenter 和主场景。保存先于普通状态发布；观察到的奖励写失败会保留 dirty 证据；结算冻结 payload，accepted-first 跨午夜重试，active 清理先于 outbox。菜单数据来自真实 bootstrap，不填虚构好友。

最新完整集成为 23 suites / 15,731 checks / 0 failures，包含三份固定 deal 的开发见证解。原生 UI suite 17 checks，真实 Viewport 鼠标事件验证首次加入、Session 取牌、动画期间拒绝第二点击、弹窗遮挡、resize 取消和卡牌节点复用；其日志还要求没有 SCRIPT ERROR。规则见证解是开发验证，不能替代自然 GUI 游玩。Node 测试器回归 5 checks，含真实脚本错误、未完成 suite、活跃 SceneTree 和异步 process_frame。

独立审阅已验证核心模块，并推动修复旧回合 press、可变动画快照、EARNED 覆盖、dirty 取消后换局、过期内存清理、冻结耗时篡改和荣誉并列排序。Router 最终复核、原生渲染录像、各视口截图和 Windows 导出包仍在进行；将在最终验收报告逐项记录，不用旧 JS 图或静态样张补充这些证明。

所有运行使用本任务独立 APPDATA/LOCALAPPDATA。原 JS 仓库保持只读；无推送、合并或发布。最终 plain/cap/scarf 与角色表演素材待用户视觉确认；T00–T14 继续使用 user-cards，图标 Phosphor Bold/MIT、字体 OFL，用户角色图版权不被改写为 CC0。
