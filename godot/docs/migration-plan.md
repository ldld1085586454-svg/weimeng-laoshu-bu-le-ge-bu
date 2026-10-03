# 卜了个卜独立 Godot 迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 用户审阅批准后，使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行。以下checkbox目前全部未执行；本轮只交付文档。

**Goal:** 在独立Godot目录交付完整可玩、规则与PR2一致、事务可恢复、动效增强的Windows本地首版，现有JS版本保持不动。

**Architecture:** 无SceneTree的GDScript reducer管理规则及奖励命令；SessionController负责写盘先后、有效计时和恢复，LocalGameService负责独立本地票据及社交记录。UI只消费已提交state和事件，AnimationDirector不会提交业务命令。

**Tech Stack:** Godot 4.7.2标准版、GDScript、2D、Compatibility renderer；Node ≥22仅用于只读JS参考fixture与静态数据导入；用Godot headless运行项目自建的最小测试runner，不新增测试框架依赖。

**Spec:** [迁移设计规格](2026-10-02-godot-migration-design.md)。基线commit：`362c61027b7a7f7e573f4b28608e3b3098e2092a`。

## Global Constraints

- 新项目`bu-le-ge-bu-godot/`与JS仓库并列；导入与测试绝不写原仓、main、浏览器profile或原local-data。
- Godot **4.7.2 标准版、GDScript、2D、Compatibility renderer**；Windows先交付，微信和生产服务不在首版范围。
- 逻辑基准画布390×720；视觉验收430×932、横向resize和高DPI；产品标题“卜了个卜”。
- mode仅`tutorial/daily/topic`；deal顺序`[270,540,720]`；slotCapacity=7；UTC+8周期。
- 玩家取牌队列容量0；动画锁期间拒绝新取牌，模态仅屏蔽底层棋盘，保留合法模态按钮。
- 规则协议`full-round-v012`，新存档信封`godot-round-v1`；独立`user://bu_le_ge_bu_godot_v1/`；不导入JS旧用户数据。
- 道具move/undo/shuffle/revive每局各1；奖励EARNED后COMMIT成功才应用和扣次数。
- 复制manifest切片、现有字体+OFL及固定deal；卡牌必须是user-cards.png；不拿旧ui-preview当运行画面。
- 最终角色替换为已查看的最新上传角色；角色动作/资源生产路线与免费统一UI图标包须通过独立视觉确认门。T00–T14用户卡牌保持。
- 不实现时结束于用户审阅；批准后只提交新Godot仓的变更，不改JS仓。无远端推送、合并或发布授权。

## Review Focus

1. 第七张形成三消必须先CLEAR再判胜负；Task 2用显式回放fixture锁定。
2. 存盘失败、奖励重复回调和EARNED重启不能丢奖或多扣次数；Task 3/4覆盖事务及故障注入。
3. 模态与后台暂停重叠，动画中resize不能再取一次牌；Task 4/7覆盖计时和生命周期。
4. 午夜前已接受但丢响应的结算可幂等重试，未接受旧票据过期；Task 5覆盖准确边界和重复贡献。
5. 270/540/720大棋盘、中文字体、高DPI、减少动效均必须实际可操作；Task 1/7/9覆盖数据、画面和连续交互。

## 文件职责与依赖

下表所有路径均为**拟创建**的新Godot项目文件，不是已存在实现。

| 路径 | 单一职责 | 依赖 |
|---|---|---|
| `project.godot`、`export_presets.cfg` | 引擎/画布/Windows导出配置 | Task 1及9 |
| `tools/import_source.mjs`、`tools/export_oracle.mjs` | 只读导入与JS参考fixture；校验输出目录隔离 | 固定sourceRoot；Node ≥22 |
| `data/source-manifest.json`、`data/catalog.json`、`data/deals/*.json` | 来源/哈希、显式配置、固定关卡 | 导入工具 |
| `assets/theme/`、`assets/audio/`、`assets/fonts/` | 原素材、五个WAV、字体及许可 | 来源清单 |
| `assets/character/`、`assets/ui-icons/`、`docs/visual-style-approved.md` | 批准后的新角色/动画与统一图标包；许可和样张 | 视觉确认门；本轮不创建 |
| `rules/canonical_json.gd`、`rules/deal_loader.gd`、`rules/blocker_graph.gd` | 稳定编码/哈希、deal验证、遮挡图 | 静态data |
| `rules/board_reducer.gd`、`rules/round_reducer.gd` | 棋盘规则；命令/奖励/revision/幂等 | Task 1→2→3 |
| `storage/atomic_store.gd`、`storage/round_codec.gd` | 原子写/备份、命令日志信封/回放验证 | Task 3 |
| `session/active_clock.gd`、`session/session_controller.gd`、`session/recovery_policy.gd` | 计时、普通/observed提交先后、恢复门槛 | Task 3/4 |
| `services/catalog.gd`、`services/local_game_service.gd`、`services/settlement_queue.gd` | UTC+8/配置、本地ticket与社交事务、outbox | Task 1/3/4 |
| `platform/reward_adapter.gd`、`platform/simulation_reward_adapter.gd`、`platform/capabilities.gd` | 奖励协议、明示模拟器、平台能力 | Task 3；不用微信SDK |
| `scenes/main.tscn`、`scenes/home.tscn`、`scenes/play.tscn`、`scenes/modal.tscn` | 根路由、主页、棋盘、当前模态 | Task 4/5/6 |
| `ui/app_router.gd`、`ui/play_presenter.gd`、`ui/modal_presenter.gd` | 场景与业务流程编排；向视图发布只读模型 | Task 4/5 |
| `presentation/tile_view.gd`、`presentation/theme_assets.gd`、`presentation/animation_director.gd`、`presentation/input_gate.gd` | 卡牌/atlas、视觉事件、手势准入 | Task 1/6/7 |
| `ui/social_presenter.gd`、`ui/preferences.gd`、`presentation/audio_director.gd` | 本地榜/荣誉/个人/换装/弹幕、偏好、音频 | Task 5/8 |
| `tests/run.gd`、`tests/assertions.gd`、`tests/test_*.gd`、`tests/fixtures/` | 无第三方headless测试、只读参考结果和小局fixture | 每任务增量 |
| `docs/source-provenance.md`、`docs/acceptance.md`、`docs/platform-status.md` | 来源、实测证据、未接入平台清单 | Task 1/9 |

唯一允许依赖方向：静态数据→rules→storage/session/service→UI→presentation。presentation可读rules结果，不能调用底层reducer写状态；业务命令必须经过SessionController。

## 测试与公共结果协议

`DispatchResult`用Dictionary统一表示：`{ok:bool, code:String, state:Dictionary, events:Array[Dictionary], replayed:bool}`；失败保持原state、events空。`StoreResult`为`{ok:bool, code:String}`；ServiceResult为`{ok:bool, code:String, data:Dictionary}`。这些是文档协议，实施时可用类型包装，但不得改变字段/语义。

引擎路径由执行者设为`$godotExe`，只指向已验证的4.7.2 console可执行文件，不覆盖HOME等系统变量。所有命令在新项目根执行：`& $godotExe --headless --path . --script res://tests/run.gd -- --suite <suite>`。runner退出0且输出`PASS <suite>`才算通过；断言失败退出1并打印fixture/步骤。Task 1先建立runner，后续不新增平行的测试入口。

JS oracle调用固定commit源码，输出每一步的合法tileId、rack/buffer/taken/blockers/cleared/status、board/round revision、配额、pending/resolved/receipts、事件和code。奖励token继续按`full-round-v012`规则推导；图的内部对象身份不比较，关卡cell顺序与ASTRA_CONTENT_V1 hash必须一致。fixture中固定roundId、commandId、clock和shuffle permutation；测试fixture与真实每日画面明确分开。

## Task 1：建立独立数据基线与遮挡图

命令JSON统一沿用`id/roundId/expectedRevision/type`；文中commandId仅指协议`id`。PICK extra为tileId；OFFER为assist/channel及仅洗牌permutation；LAUNCH/COMMIT/CANCEL/FAIL/INTERRUPT/SHARE_HIDE/SHARE_RETURN/APPLY_FAILED为token；AD_CLOSE为token及可选bool isEnded；拒绝多余字段，token与oracle签名前不得改字段名。

**Files:** project.godot；tools/import_source.mjs；tools/export_oracle.mjs；data/；assets/；rules/canonical_json.gd、deal_loader.gd、blocker_graph.gd；tests/run.gd、assertions.gd、test_deal.gd；docs/source-provenance.md。

**Interfaces:**
- `DealLoader.load_deal(path:String) -> Dictionary`返回`{ok,code,deal}`。
- `BlockerGraph.build(deal:Dictionary) -> Dictionary`返回`{ok,code,parents,children,by_id}`；非法布局拒绝。
- `CanonicalJson.encode(value:Variant) -> String`，`CanonicalJson.snapshot_hash(deal:Dictionary) -> String`。
- import工具：`node tools/import_source.mjs --source <sourceRoot> --project <projectRoot>`；oracle工具：`node tools/export_oracle.mjs --source <sourceRoot> --output tests/fixtures/oracle.json`。

- [ ] 写失败测试：边缘接触不挡、高z正面积挡低z、同层中央相交拒绝、side相邻position关系、跨zone/不同side堆相交拒绝、非整数几何拒绝。验证复制后三份deal牌量270/540/720、hash等于源hash、槽容量7。
- [ ] 运行`--suite deal`确认失败，并建立来源清单测试：六张当前theme PNG、manifest/index、字体+OFL、5个WAV必需；输出指向sourceRoot或子目录时拒绝且源目录哈希不变。
- [ ] 只在新目录创建project/runner和上述纯逻辑；从固定commit导入配置/资源，音频来自独立构建副本。所有catalog值导出为明确JSON，不在产品运行时执行JS。
- [ ] 运行导入、oracle生成和`--suite deal`；检查全部中文UI文案glyph，缺字时按规格引入静态Noto Sans CJK SC Regular 2.004及OFL。记录资源源路径、SHA256、commit及生成音频来源。
- [ ] 对新项目Task 1变更评审并提交；不提交生成的Godot缓存`.godot/`，不修改JS源。

## Task 2：移植棋盘纯规则

**Files:** rules/board_reducer.gd；tests/test_board.gd；tests/fixtures/board_cases.json。

**Consumes:** Task 1 deal/graph/hash。**Produces:**
- `BoardReducer.create(deal:Dictionary, round_id:String) -> Dictionary`。
- `BoardReducer.legal_tiles(board:Dictionary) -> Array[String]`。
- `BoardReducer.pick(board:Dictionary, tile_id:String) -> Dictionary`。
- `BoardReducer.eligible(board:Dictionary, assist:String) -> String`，可用时空字符串。
- `BoardReducer.apply_assist(board:Dictionary, assist:String, permutation:Array) -> Dictionary`。
- `BoardReducer.check_invariants(board:Dictionary) -> Dictionary`返回`{ok,code}`。

- [ ] 写失败测试并用`--suite board`确认：取被挡/已取/未知牌拒绝；同类插到最后同类之后；TAKE→CLEAR→WON/LOST顺序；第七张形成三消存活；第七张无三消失败；全消且暂存空才胜利。
- [ ] 补暂存任意回取、移出前三张、暂存占用禁止移出、只能撤最近未消中央牌、侧堆/暂存不可撤回；洗牌保留布局/已取/槽/暂存且类型守恒；七格复活追加前三张、保留旧暂存、最多6张及候选标签。
- [ ] 实现全部纯函数，保持输入state不变；每次成功后检查牌守恒、遮挡计数、类型三倍消除、未残留三张同类和status；不创建Node或Tween。
- [ ] 跑`--suite board`及JS oracle逐步对齐，包含完整教学、小局胜/负及三副固定270/540/720关卡各自完整receipt witness回放，逐步对齐合法性/槽/暂存/守恒/遮挡并最终WON；失败打印首个不同字段。witness仅用于自动规则测试，不伪装玩家自然每日通关。
- [ ] 评审并提交该独立规则单元。

## 视觉确认门：可与Tasks 2–5并行审阅，最终角色/UI实施前必须完成

**Input:** `[private attachment ID omitted]`的已查看707×1536单poseJPEG、免费素材研究候选；规格中新角色与UI章节。**Output:** 用户批准的`docs/visual-style-approved.md`及实际可消费的资源清单，不是产品代码。

- [ ] 准备并审阅主页/棋盘样张，确认新角色位置、plain/cap/scarf外观与待机/点击/三消/失败/复活/结算动作清单；选择分层rig/Tween或多姿态sprite，不能把未经生产的动画描述成现有素材。
- [ ] 在免费候选中只选一套主图标包，确认返回/设置/关闭、三道具及全部菜单映射；记录真实许可、分发/修改/署名要求、来源和版本，确认统一栅格/描边/禁用态。
- [ ] 推荐Phosphor Bold、24/32/40逻辑尺寸与≥48触区，奶油浅绿面板；Kenney只作替代路线，未选择前不混包。移出按三牌进暂存、复活按生命语义，保持文字；不新增商城签到。角色覆盖home/win/plain/cap/scarf/grave及三荣誉，用户角色不能标CC0。
- [ ] 用户确认样张与许可记录后，才执行透明角色准备、分层/补姿态或帧制作及图标导入；保存原JPEG和identity记录，产物另存；清除黑边/“2/11”，不改现有用户卡牌。
- [ ] 推荐分层原图身份的身体/三簇叶/眼星/嘴舌/阴影，先演示呼吸叶摆、眨眼点击，再扩展胜败/复活；具体路线由首页+对局样张确认，不能假定原JPEG带分层或动画帧。
- [ ] 检查最终资源manifest、alpha、切片边界和尺寸；保留背景/按钮等组件是否更新的明确决定，禁止旧羊资源混入最终角色。Task 6最终美术和Task 7角色动画依赖此准入。

视觉门未完成时，可验证Tasks 1–5纯规则和服务；Task 6可用明确临时占位视图验证流程，但不将占位或旧羊画面当成最终视觉交付。

## Task 3：命令状态机与奖励合同

**Files:** rules/round_reducer.gd；platform/reward_adapter.gd、simulation_reward_adapter.gd、capabilities.gd；tests/test_round.gd、test_rewards.gd。

**Consumes:** Task 2 BoardReducer。**Produces:**
- `RoundReducer.create(deal:Dictionary, round_id:String) -> Dictionary`。
- `RoundReducer.dispatch(state:Dictionary, command:Dictionary) -> Dictionary`。
- `RoundReducer.fingerprint(state:Dictionary) -> String`，`RoundReducer.metrics(state:Dictionary) -> Dictionary`。
- RewardAdapter：`launch(request:Dictionary) -> void`、`cancel() -> void`，信号`result(event:Dictionary)`；event含roundId/token/kind，kind仅ad_close/share_hide/share_return/failed/cancelled，ad_close可带bool isEnded。

request明确为`{roundId,token,assist,channel}`；所有启动异常必须发同roundId/token的failed事件，不能悬挂WAITING。

- [ ] 写失败测试，运行`--suite round`：roundId错、stale revision、unknown command/多余字段、同commandId不同内容冲突；同命令重放ok且events空；命令上限10000。
- [ ] 写`--suite rewards`：OFFER/LAUNCH/EARNED/COMMIT；不完整或未知ad关闭不发奖；share必须hide再return且verifiedSend=false；EARNED不可取消；COMMIT失败不扣；四道具各1、video/share共享；旧token/旧局/重复callback不多应用。
- [ ] 按JS事件名称和token推导实现Reducer，round revision与board revision独立；simulation UI提供明确“模拟完成/提前关闭/取消/模拟请求失败”，不自动制造真实平台证据。
- [ ] 跑两个suite及oracle，验证GRANT_APPLIED只一次、pending=null和resolved=APPLIED；第一次后续PICK只一次输出PLAY_RESUMED_AFTER_GRANT。
- [ ] 评审并提交状态机与平台协议；微信capability全未接入。

## Task 4：存档、命令提交、恢复与有效计时

**Files:** storage/atomic_store.gd、round_codec.gd；session/session_controller.gd、recovery_policy.gd、active_clock.gd；tests/test_storage.gd、test_recovery.gd、test_clock.gd。

**Consumes:** Task 3 round protocol。**Produces:**
- `AtomicStore.read(key:String) -> Dictionary`返回`{ok,code,text}`；`write(key:String,text:String) -> Dictionary`；测试store同接口。
- `RoundCodec.encode(state:Dictionary,meta:Dictionary) -> String`；`restore(text:String) -> Dictionary`返回`{ok,code,state,meta}`。
- `SessionController.configure(deal:Dictionary,round_id:String,meta:Dictionary,store:RefCounted,clock:RefCounted) -> Dictionary`；meta含ticket/scope/elapsedMs/settlementPending，ticket.id须等于round_id；`restore(text:String,expected_scope:String,wall_ms:int,store:RefCounted,clock:RefCounted) -> Dictionary`返回`{ok,code,action}`，内部RoundCodec重放后按RecoveryPolicy选择动作，恢复原roundId/log/pending/receipts/elapsed，不能重新create替代；`send(type:String,extra:Dictionary,observed:bool=false) -> Dictionary`；`flush() -> Dictionary`；`snapshot() -> Dictionary`；信号`committed(before:Dictionary,after:Dictionary,events:Array)`只在实际发布后发。
- `RecoveryPolicy.inspect(record:Dictionary,scope:String,now_ms:int) -> Dictionary`返回`{action,code,record}`，action为none/recover_earned/settle_terminal/error。
- ActiveClock：`reset(base_elapsed_ms:int=0) -> void`清旧pause reasons及活动段；`start()/stop()/pause(reason:String)/resume(reason:String)/elapsed_ms() -> int`，配置注入单调now Callable。新局reset(0)，恢复reset(meta.elapsedMs)再按恢复模态/lost/hidden状态设置暂停，elapsed_ms返回base+新活动段。

- [ ] 写失败测试并分别运行storage/recovery/clock：普通写失败state/revision/配额不变；observed写失败state保留且dirty；dirty普通命令先flush，flush失败仍拒绝；临时文件/坏checksum/错版本/超8MiB/重放不符拒绝。
- [ ] 覆盖恢复：EARNED可恢复，WAITING重启中断且不赚奖；普通PLAYING不续局、首次未确认LOST不续局；待结算WON/确认终局可恢复，scope不符或未接受的过期ticket不能续局。
- [ ] 覆盖新局configure和restore路径：恢复保留原roundId、命令日志、pending/token/receipts及baseElapsed；换局清旧pause reasons。最后取牌日志已落盘但outbox写失败时，重启根据active终局重建同ticket/log/elapsed的payload，不开启新局。
- [ ] 覆盖重叠暂停modal+hidden+lost，只清一项不计时；普通取牌动画计时，终局冻结elapsed，网络/写盘重试不计；墙钟回拨不产生负有效时长。
- [ ] 实现原子写.tmp→校验→替换、保留上版；实现规则先写后发布和observed例外。存档只信初始deal+命令日志重放，meta用于ticket/时长/恢复门槛，不信任未验证state快照。
- [ ] 运行三suite及跨进程重启恢复测试；评审并提交。

## Task 5：本地服务、票据与结算幂等

**Files:** services/catalog.gd、local_game_service.gd、settlement_queue.gd；tests/test_catalog.gd、test_service.gd、test_settlement.gd。

**Consumes:** Task 1配置、Task 3重放、Task 4存储。**Produces:**
- `Catalog.cycle(wall_ms:int) -> String`，`next_reset(wall_ms:int) -> int`，`deal_index(day:String,mode:String) -> int`。
- `LocalGameService.configure(store:RefCounted,wall_now:Callable) -> void`，`call(user_id:String,action:String,data:Dictionary) -> Dictionary`；action仅bootstrap/start/settle/equip/bullet。
- `SettlementQueue.enqueue(payload:Dictionary,ticket:Dictionary) -> Dictionary`；`retry(service:RefCounted,user_id:String) -> Dictionary`；`pending() -> Dictionary`。

- [ ] 写失败测试并跑catalog/service/settlement：UTC 15:59:59→16:00:00切日；daily/topic固定选择；tutorial固定12张且WON持久化后tutorialDone才变true；ticket绑定user/mode/day/dealHash/expiry。
- [ ] 覆盖结算：owner错、非terminal、有pending reward、deal不匹配、elapsed不合法拒绝；同ticket同payload重复接受不重复结果，同ticket不同payload冲突；已接受结果跨午夜重试成功，未接受旧ticket过期拒绝。
- [ ] 覆盖服务已接受后清active失败、清outbox失败、两项部分清理；原payload可重试且贡献/历史不重复，全部清理成功才解除settlementPending。outbox创建失败时能由Task 4已持久化终局重建，不改变log或elapsed。
- [ ] 覆盖贡献：(userId,day,mode)去重、daily/topic分开；新ticket二次胜利留attempts/历史但不重复贡献；daily胜利解锁cap；昨日topic赢方且本人有胜绩才解锁scarf；教学不进榜；locked skin不能equip；bullet只六预设、存100条且bootstrap展示当日最后12条。
- [ ] 验证空库不生成虚拟人或非零排名；history.wins计不同每日胜利日期、records含真实三模式结算；昨日topic平局不解锁scarf。
- [ ] 实现draft事务，社交存储失败不发布db；独立local userId与新user数据。outbox存完全相同payload，任何retry不改elapsed或log；接受前有持久化失败可重试。
- [ ] 运行三个suite和一次真实重启outbox；评审并提交。无HTTP服务、登录token、微信云端或生产排名实现。

## Task 6：接通完整主页、教学、对局与模态

**Files:** scenes/main/home/play/modal.tscn；ui/app_router.gd、play_presenter.gd、modal_presenter.gd；presentation/tile_view.gd、theme_assets.gd；tests/test_flow.gd。

**Consumes:** Task 4 session/recovery、Task 5 service、Task 3RewardAdapter；最终美术需视觉确认门已批准资源。**Produces:**
- AppRouter：`initialize() -> void`先加载偏好/身份/bootstrap、检查outbox/active并调用Task 4restore，再展示恢复/待成绩或主页；`start_mode(mode:String) -> void`、`return_home() -> void`；用真实ticket启动，pending结算时拒绝新局。
- PlayPresenter：`bind_session(session:RefCounted,ticket:Dictionary) -> void`、`intent_pick(tile_id:String) -> void`、`intent_assist(assist:String) -> void`。
- ModalPresenter：`show_modal(kind:String,model:Dictionary) -> void`、`close_modal() -> void`；只路由当前可用按钮。
- ThemeAssets：`texture(asset_key:String) -> Texture2D`按manifest使用AtlasTexture；TileView：`bind(tile:Dictionary,rect:Rect2,enabled:bool) -> void`。

- [ ] 写失败flow测试：首次主页加入→tutorial；12牌WON→settle成功→准备好了→daily；tutorialDone已存后加入直接daily；话题→topic；退出确认可取消/返回；LOST→复活选择→模拟奖励→真实复活→继续。
- [ ] 覆盖WON/LOST待成绩、RECOVERY、EXPIRED、加载错误/重试；模态遮底层但关闭/取消/恢复按钮可操作；每日新局阻断settlementPending；失败错误不显示“已保存”。
- [ ] 建立真实场景和presenter，中央/侧堆/槽/暂存取牌均经SessionController；按钮eligibility及次数绑定权威state；开始前先处理恢复与outbox。
- [ ] 接入批准的新角色资源和统一图标语义映射，T00–T14纹理仍为user-cards；角色皮肤只影响外观。未通过视觉门时只保留标注占位并暂停最终美术，不擅选包或生成动作。
- [ ] 跑`--suite flow`，手动自然完成教学并进入真实每日，验证user-cards素材、实际侧堆与槽。此Task可先无动效，但不得用硬编码演示替代玩法。
- [ ] 评审并提交可玩主流程。

## Task 7：动画导演、手势与生命周期

**Files:** presentation/animation_director.gd、input_gate.gd；tests/test_animation.gd、test_input.gd、test_lifecycle.gd；TileView增表现方法。

**Consumes:** Task 6视图、Task 4committed事件。**Produces:**
- `AnimationDirector.play_transition(before:Dictionary,after:Dictionary,events:Array,reduced_motion:bool) -> void`；`snap_to(state:Dictionary) -> void`；`cancel_and_snap(state:Dictionary) -> void`；信号`presentation_finished(round_id:String,revision:int)`只报告表现。
- `InputGate.press(pointer_id:int,target_id:String,round_id:String) -> void`、`release(pointer_id:int,target_id:String,round_id:String) -> Dictionary`；`cancel_all(reason:String) -> void`；`set_board_locked(value:bool) -> void`。
- TileView：`set_visual_transform(scale:Vector2,offset:Vector2,opacity:float) -> void`，不修改logical rect。

- [ ] 写失败测试并跑animation/input/lifecycle：一次committed只播放一次；Tween结束不改revision或配额；动画锁拒绝连续第二次取牌；按A放B/拖出/第二指/后台/resize不发取牌；模态按钮可用但底层不能取。
- [ ] 实现规格精确时序：按下0.94→释放1.04→1.00总120ms；飞入槽180ms锁185ms；CLEAR180–440ms、粒子210–500ms锁445ms；道具230ms锁240ms；洗牌脉冲260ms；通关最早510ms、面板160ms。
- [ ] 保留before过渡槽用于三消显示；LOST状态先提交，面板等入槽结束才出现；WON结算提交立即进行，视效不能决定是否保存成功。
- [ ] 生命周期cancel只snap到已提交state、销毁过渡节点、清视觉队列；减少动效Tween为0、无粒子、下一帧解锁。换局清旧round表现，旧callback无效。
- [ ] 按批准动作清单实现新角色待机/反馈/结算动画，优先级终局>道具>三消>待机；角色表演不提交取牌/道具/结算，也不延长业务锁来等待无关待机动作。具体帧/骨架和播放参数来自visual-style-approved，不在未确认前定稿；reducedMotion静态角色。
- [ ] 跑三suite，再实际操作三消/移出/撤回/洗牌/复活/失败/通关。测试通关可用标明的小fixture，真实每日图不伪造胜利；评审并提交。

## Task 8：真实本地社交菜单、偏好与音频

**Files:** ui/social_presenter.gd、preferences.gd；presentation/audio_director.gd；scenes/social.tscn、settings.tscn；tests/test_social_ui.gd、test_preferences.gd。

**Consumes:** Task 5bootstrap和equip/bullet、Task 6路由、Task 7reduced_motion。**Produces:**
- `SocialPresenter.render(info:Dictionary,page:String) -> void`，page为rank/friends/topic/honor/profile/wardrobe/club；club无原生能力时显示明示未接入说明。
- `Preferences.load(store:RefCounted) -> Dictionary`、`save(store:RefCounted,prefs:Dictionary) -> Dictionary`；键music/sound/vibration/bullets/reducedMotion。
- `AudioDirector.apply_preferences(prefs:Dictionary) -> void`、`play_cue(name:String) -> void`、`set_context(scene:String,modal:String,visible:bool) -> void`。

- [ ] 写失败测试并跑social_ui/preferences：地区榜/本地朋友圈历史、三荣誉和个人记录来自bootstrap；皮肤锁定不可装备、已解锁装备重启保留；六bullet触发服务记录并按开关实际显示；设置写失败恢复旧值并提示。
- [ ] 实现每个菜单实际行为和空状态，明确“本地开发数据/未接入微信”；不添加不存在的改名/改地区写接口，不展示虚构好友。
- [ ] 复用五WAV，音效一次业务事件一声，音乐不在模态/后台重复叠播；开关即时生效；震动能力不支持时不给成功假反馈；reducedMotion驱动Task 7。
- [ ] 运行两个suite，重启检查皮肤/设置/个人记录，并观察后台静音和重复进入场景无重叠音轨；评审并提交。

## Task 9：跨模块验收、原生截图与Windows交付

**Files:** export_presets.cfg；tests/test_acceptance.gd；docs/acceptance.md、platform-status.md；dist/Windows产物；artifacts/screenshots/真实截图。

**Consumes:** Tasks 1–8全部；Spec的范围表。**Produces:** 用户可打开的新GodotWindows版本、原生画面、明确平台状态和完整验收证据。

- [ ] 用`--suite all`跑所有已定义suite；失败先定位并修复拥有该职责的任务，不绕过断言。输出规则oracle一致、全部保存/奖励/结算故障测试通过；测试使用独立临时user目录，不能污染正常玩家存档。
- [ ] 自然操作：新档主页→教学三消→教学结算→每日；实际取侧堆、暂存回取和三种普通道具；真实七格失败→一次模拟复活→继续。用明示测试fixture完成胜利，并记录“fixture胜利”，不冒充270牌每日通关。
- [ ] 事务验收：EARNED兑现前重启、终局动画中重启、最终取牌已存但outbox创建失败重启、服务接受后active/outbox部分清理失败、响应丢失重试；坏档、写失败、旧票据午夜过期；重复callback/command不多发奖或贡献。每项记录expected/actual及日志摘要。
- [ ] 270/540/720三份固定deal各跑完整witness到WON并对齐JS oracle，记录全部层/侧堆及守恒通过；人工开发切换观察三种棋盘时标明“开发关卡预览”，不声称它们都是当天每日自然进度。
- [ ] 视觉验收：430×932、390×720、resize、高DPI；主页/真实棋盘/教学完成/失败与胜利模态原生截图；中文无缺字，边界不裁切，牌面清晰；查看动效与减少动效两套，观察帧时间和节点数量在重复换局后无增长。
- [ ] 逐场景验证新角色已替换羊、同角色plain/cap/scarf与荣誉/终局形象一致；UI图标来自已确认单包，全部状态规格一致且许可随包；卡牌仍用当前用户图案。
- [ ] 运行`& $godotExe --headless --path . --export-release "Windows Desktop" dist/Windows/bu-le-ge-bu.exe`；通过后在独立本地窗口验证导出包，不仅验证编辑器。Windows zip包含exe与资源，保留源项目和asset来源；未安装导出模板时先记录所需版本，不声称已打包。
- [ ] 按Spec功能表逐项填写已验/未接入；微信SDK、原HTTP宿主、跨设备服务、真实广告/分享/好友/收益、完整生成器继续列后续。只有全部首版范围可验证才交付，菜单外观不能替代行为。
- [ ] 最终新Godot分支评审、提交、保存原生截图及交付文件至Library；等待用户另行指示才推送/合并/发布。

## 数据迁移执行策略

静态：固定源commit→只读导入清单→新目录复制→逐文件SHA256→Godot import；manifest切片不重新打包，不改原card ID。配置：catalog/profile抽成新项目JSON，保留模式、配额、regions、skins、bullets、cycleOffsetMinutes=480和重建标记。音频：只从隔离build复制五WAV并记录原生成脚本；字体和OFL一同复制。

动态：新local userId、新Godot存档和db；不搬浏览器localStorage/social.json/token/ticket/pendingReward，故不会把旧奖励误发到新客户端。规则与存档有不同版本字段；未来跨引擎进度迁移须另批准专用导入流程，本轮不实现。

## 实施顺序与审阅方式

依赖为 `1→2→3→4→5→6→7→8→9`；独立视觉确认门在Task 6最终美术和Task 7角色动作之前。Task 1之后视觉方案/来源审阅可与Tasks 2–5纯规则并行；确认前不生产最终角色或导入未选图标。Task 7完成后Task 8菜单可并行补交付文档；共享规则/session接口先稳定，不让两个任务并改同一业务文件。

推荐按task派实现者、独立审阅者，再做最终全项目评审，因为奖励、写盘、动画的先后关系容易出现局部正确却组合错误。用户也可选择由主线程依次实现，最后一次独立审阅。执行方式与具体规格都待用户审阅；本轮不创建项目代码或安装产品依赖。

## 文档自检结果

本计划已逐项映射规格的完整核心玩法、奖励事务、存档恢复、计时、固定关卡、五类动效、本地社交/设置和微信边界。所有公共接口均在产生任务定义，引用任务使用同名字段；Review Focus的五项均有明确拥有任务与断言；每任务有失败测试、实现、验证和新项目提交步骤。以上是**计划检查**，不是Godot实现或测试通过的声明。
