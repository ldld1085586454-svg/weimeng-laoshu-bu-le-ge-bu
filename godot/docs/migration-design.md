# 卜了个卜独立 Godot 迁移设计草案

状态：用户已于 2026-10-02 确认本规格；独立项目已开始实施。此文件保留已批准的设计要求，当前实施与检查结果记录在阶段报告中。JS 原仓保持只读，无合并或发布。

## 目标与边界

用户已决定保留当前 JS 项目，另开独立 Godot 项目，并加强选牌、入槽、三消、道具和结算动画；最新要求是用上传角色替换羊、增加角色动画，并将UI及功能图标换成免费且规格统一的素材。本草案建议先完成规则一致、真实可玩、能保存及恢复奖励/结算事务的本地2D版本，再评审网络与微信接入。第一阶段必须能自然完成教学、进入真实每日关卡、触发胜负及四种道具，不能只有可点击的视觉菜单。现有用户卡牌不因换角色而替换。

基线为 PR2 精确 commit `362c61027b7a7f7e573f4b28608e3b3098e2092a`，原 JS 仓库和 main 保留；本次预览和所有提案在独立目录。拟建项目目录为 `bu-le-ge-bu-godot/`，与 JS 仓库并列，不放入其工作树。Godot 版本建议锁定 **4.7.2 标准版、GDScript、2D、Compatibility renderer**；该版本来自[官方 Windows 下载页](https://godotengine.org/download/windows/)，后续实施前验证本机引擎与导出模板。第一交付目标 Windows 本地运行，逻辑基准画布 390×720、可扩展竖屏；用 430×932 截图与 JS 基线对照。

本阶段本地身份、模拟奖励和排行榜须如实标示。Godot 存档使用 `user://bu_le_ge_bu_godot_v1/`，不读取或覆盖浏览器 localStorage。跨引擎存档互通不列入第一阶段。

## 可选路线

| 路线 | 结果与代价 |
|---|---|
| **推荐：纯 GDScript 规则移植 + JS 参考结果对齐** | 独立 Godot 项目，复用素材与固定关卡；规则、恢复、界面均可测，适合原生动画；需要认真移植命令和事务。 |
| Godot 外壳 + 内嵌/桥接 JS | 初期保留 JS 语义较快，但新增桥接与平台依赖，不是干净独立的 Godot 规则实现；不建议作为本阶段交付。 |
| 重写简化三消玩法 | 容易做漂亮画面，却会丢失侧堆、道具事务、去重和恢复语义；与本次目标不符。 |

## 当前功能与第一阶段覆盖

| 当前 JS 功能 | Godot 第一阶段实际覆盖 | 后续/限制 |
|---|---|---|
| 主页、教学、每日、话题挑战 | 四条真实流程，12 张教学和固定关卡 | 产品标题统一为“卜了个卜”；原 PR2 当前标题是“羊了个羊” |
| 中央遮挡、侧堆、七格槽、暂存、胜负 | 完整移植，按 tileId 和逻辑矩形计算 | 不以动画旋转、阴影或碰撞体改变规则 |
| 移出、撤回、洗牌、复活 | 完整状态事务 + 明示的本地奖励模拟器 | 真实广告/分享平台完成依据另验 |
| 存档、待兑现奖励、待结算恢复、退出及过期 | 与当前恢复策略一致，原子写入、重放校验、幂等结算 | 不新增普通中途自动续局，不兼容 JS 原始存档 |
| 地区榜、朋友圈/历史、三荣誉、个人记录 | 本地开发数据与当前计算规则；菜单有真实行为 | 非真实好友数据、非生产跨设备排名 |
| 三皮肤解锁装备、六预设弹幕 | 原解锁门槛、装备持久化、实际显示 | 皮肤无属性加成；素材复用须保留许可来源 |
| 音乐、音效、震动、弹幕、减少动效设置 | 设置保存，音频/视觉生效；震动走平台 capability | 不支持震动的平台明确能力受限 |
| 270/540/720 固定关卡与离线生成器 | 原三份 JSON、原每日选择算法 | 完整生成器作为第二阶段单独移植，不使用随意随机摆牌替代 |
| 微信接口桩、开放数据域、广告、分享、游戏圈 | 只保留 adapter 协议和 capability 状态 | 微信真机、AppID、adUnitId、生产登录及平台审核均未验证 |

## 新角色与UI视觉确认门

角色依据是用户最新Library图片 `[private attachment ID omitted]`，原文件`9c96b769a83e2e86db627d64399ad943.jpeg`，原生file_id为`[private attachment ID omitted]`。已下载并查看实际像素：707×1536 JPEG，橙色圆身、绿色叶冠、蓝色眼内黄色星形和张嘴大笑；图片包含黑色手机截图边和“2/11”，只有一张姿态，没有透明背景、分层或动画帧。文件SHA256为`FF092FB6B67DC9F84D7CE111338D5B785F4DE07FC0CD1945CD81EEC91A61AEEB`。

“羊换成新角色”已在方向范围内；具体角色姿态、动作和图标包尚待视觉方案确认。角色需覆盖主页、普通形象、通关/教学、失败/复活和荣誉展示；皮肤plain/cap/scarf的解锁规则保持，视觉改为同一新角色的外观变体，不继续用羊当最终角色。候选动作可含待机呼吸/叶冠轻摆、点击弹性、三消欢呼、失败沮丧、复活回弹、结算庆祝；这些只是待审动作清单，不声称单JPEG已有这些帧。

实现前单独交付视觉样张并选择：A）原画身份保持的分层rig/Tween方案；B）角色多姿态sprite方案。两者都须先清理截图UI并得到合格透明素材，保持配色和脸部特征，不把黑边/计数器带入游戏。无需为了角色变化重画或重新编号当前T00–T14卡牌。

推荐先试A，拆分身体、三簇叶冠、眼/星形、嘴/舌与独立阴影，做呼吸、叶摆、眨眼和点击弹跳样张；没有手脚的原角色不擅自加手脚。动作与外观覆盖语义键home/win/plain/cap/scarf/grave及first/king/fast三荣誉头像，逐项检查不漏旧羊。用户上传角色的对外发布权尚未核验，不能标为CC0；这不影响本轮本地规格审阅，分发前须补清该素材来源授权记录。

图标包按一套免费可用、许可可核验的来源选择，当前不定稿候选。视觉样张至少覆盖设置/返回/关闭、移出/撤回/洗牌/复活、排行榜/好友/话题/换装/个人/游戏圈；推荐统一24/32/40逻辑尺寸、触区至少48，同描边或同填充风格，标准/按下/禁用状态统一，保留奶油浅绿面板。规格由用户样张确认，不能混搭不同包来凑功能，也不能只因“免费下载”就认定允许项目分发。

图标语义保留动作文字：移出是“三张牌进暂存”，不能用删除/垃圾桶表示；复活用心形等生命语义，不用刷新来混同洗牌；洗牌、撤回各自保持可辨认文字与次数。菜单按当前功能映射，不擅增商城、签到或其他未有功能。

研究推荐候选为Phosphor **Bold**：其[官方MIT许可](https://github.com/phosphor-icons/core/blob/main/LICENSE)要求随分发保留版权与许可文本；与现有奶油田园面板配套制作样张。备选是[Kenney UI Pack](https://kenney.nl/assets/ui-pack)，官网标为CC0。这里只列来源已核验的推荐，尚未获得具体包和视觉方案的用户确认；实施时须锁定实际下载版本并复查包内许可，不能把两包混用当成已经统一。

**视觉准入条件**：确认实际角色动作方案与图标包；保存来源链接、具体包/版本、许可及署名要求；检查透明边缘、切片边界、缩放清晰度和语义可识别性；在主页/棋盘两张样张确认后，才进行角色拆层/补姿态及最终UI资源接入。规则、事务、存档和本地服务任务可先独立完成；最终视觉任务和发布必须过此门。本轮没有裁图、生成动画帧或选择最终图标包。

## 规则合同

1. **遮挡**：矩形具有正面积交集才遮挡，边缘接触不挡。中央同区域高 z 挡低 z；侧堆同 stackId 按相邻 position 连接，0 为顶。同层中央、跨区域或不同侧堆相交属于非法布局。合法中央/侧堆牌须未取且 blockers=0；暂存牌允许任意顺序回槽。
2. **取牌与三消**：仅 PLAYING 可取。新牌插在槽中最后一张同类牌之后；同类恰好三张即清除。先三消再判七格失败。槽长达到 7 为 LOST；cleared=总张数且槽/暂存都空为 WON。一次命令输出 `TAKE → CLEAR（可选）→ WON/LOST（可选）`。守恒：已取数量=已消除数量+槽长+暂存长；按类型的已消除数量为 3 的倍数。
3. **道具**：移出、撤回、洗牌、复活每局各一次，视频/分享共用配额。移出仅槽≥3且暂存空，移动槽前三张；撤回仅最近一张未消除的中央牌，侧堆/暂存来源不可撤回；洗牌只排列未取牌的类型，布局、槽、暂存保留，实际排列写入日志。复活仅七格 LOST，槽前三张追加到已有暂存，最多六张，不删牌；保留 `research-revive-append-three-v011` 候选标签。
4. **奖励**：pending阶段为 `OFFERED → WAITING → EARNED`；COMMIT是命令，成功后写入resolved状态APPLIED、pending=null，应用道具并扣次数。EARNED不能通过取消来丢弃，必须兑现或恢复。取消、未完整广告、未知结果不发奖；重复 callback/token/command 不重复应用。原分享 hide→show 只表明返回，不能声称成功发送。本地模拟器由玩家明确完成/取消，不伪装平台证据。
5. **关卡**：游戏mode字面值为 `tutorial/daily/topic`，固定关卡数组顺序为 `[270,540,720]`；每日周期 UTC+8 午夜，选择 `SHA256(day + ':' + mode)` 前八个 hex 的整数 `%3`，同日同模式保持同一副牌。教学固定十二张，也走start→ticket→settle；tutorialDone只在WON结算持久化成功后更新。每份JSON验证布局、牌量、ASTRA_CONTENT_V1哈希和slotCapacity=7；哈希保持原单元格数组顺序与整数编码。
6. **命令**：协议字段明确沿用 `id/roundId/expectedRevision/type`；文中的commandId是`id`的说明名，不是新JSON字段。错误局、冲突重放、过期revision拒绝。重复同一命令须按既有幂等语义处理。逻辑不依赖帧数、Tween或节点生命周期。

## 状态与动画的事件时序

玩家意图 → 输入准入 → 纯 reducer 得到候选 state 与事件 → 普通命令写盘成功 → 发布真实 state → 动画导演消费一次事件 → UI 收敛到已提交 state。**Tween 完成回调不能再取牌、再三消、再扣次数或再次结算。** 快照中 state 是权威，画面中的飞牌/待消牌是过渡副本。

| 表现 | JS 基线 | Godot 提案 |
|---|---|---|
| 按下/选牌弹性 | 下移 2px | 按下缩放 0.94、释放回弹至 1.04 再到 1.00，总 120ms；命中用未变形逻辑矩形 |
| 飞入槽 | 180ms；输入锁185ms | 180ms Tween 飞行 + 小弧线，结束后槽位置收敛；普通点击锁185ms |
| 三消 | 180–440ms 缩小到0.58、上浮8px、淡出；粒子210–500ms；锁445ms | 保留三张过渡槽牌，按同一时间表播放；轻微闪光/粒子/音效，零额外规则变更 |
| 移出/撤回/复活 | COMMIT后230ms，锁240ms | 相同提交点与时长，移动到真实新位置；失败不播放成功效果 |
| 洗牌 | 透明脉冲260ms | 260ms 翻转/透明过渡，只展示已提交的排列 |
| 失败 | JS首次失败可能立即覆盖第七张飞行 | LOST立即提交；失败面板等185ms入槽完成后展示，这是明确的表现调整 |
| 通关及教学完成 | 最终三消结束后最早510ms；面板淡入160ms | 最终消除后展示，结算提交立即开始；服务确认前显示“保存中”，不得先显示已保存 |
| 减少动效 | 当前偏好开关 | 按下/飞行/三消/道具Tween=0ms，粒子关闭；状态提交与失败/恢复语义不变，解除锁在下一帧完成 |

动态短过渡使用[Godot Tween](https://docs.godotengine.org/en/stable/classes/class_tween.html)，结算编排用 AnimationPlayer；角色帧动画可用[AnimatedSprite2D](https://docs.godotengine.org/en/stable/tutorials/2d/2d_sprite_animation.html)。第一阶段以可复用现有位图为主，不为了动效重新绘制卡牌。

## 输入合同与生命周期

首阶段玩家取牌输入队列容量为 **0**，与 JS 一致：动画锁、busy、加载、待结算时拒绝新的棋盘取牌；模态显示时只注册当前模态合法按钮，屏蔽底层棋盘，关闭/取消/复活/重试按钮仍按各自业务条件可用。按下记录语义targetId、tileId与roundId，释放重新核对目标、最新合法性和当前场景；拖出、多触点、切后台、窗口 resize 取消手势。动画导演可有表现事件队列，但不能排队未经重新验证的玩家取牌命令。

若用户希望快速连续操作，须作为新行为另行确认：最多一条 tileId 意图，出队重新验证 roundId/revision/遮挡/模态，终局或换局清空；本草案不默认开启。

后台或 resize：取消手势、停止当前 Tween，重建为已提交 state 的最终画面，清空过渡节点及视觉队列；不得重放业务事件。待平台奖励观察、存档及结算任务继续按事务状态管理，不把取消动画当成取消道具或成绩。

有效游戏计时使用单调时钟与暂停原因集合，原因至少为 `modal/hidden/lost`，必须全部清除才继续。一个模态在后台关闭不能错误恢复计时；复活成功清除lost，但仍处于hidden时不计时。普通取牌和三消动画计入有效游戏时间；终局立刻stop并冻结elapsedMs，结算或写盘重试等待不计时。墙钟只用于UTC+8周期和票据过期，墙钟回拨不产生负有效时长。

后台直接清Tween并snap是Godot的明确表现调整：JS后台只停帧、取消手势并暂停计时，resize才直接清过渡。本提案改变后台画面恢复方式，但不改业务状态、奖励完成观察或结算时长。

## 存档与结算

存档信封版本为 `godot-round-v1`，规则协议标识保留 `full-round-v012`。权威回放payload包含初始deal、roundId、命令日志和最终指纹；revision、配额、pending、receipts等由重放重建，不接受未经验证的重复快照覆盖。外层携带checksum、ticket、scope、elapsedMs与settlementPending；pending/receipts可作诊断缓存，但恢复只信回放结果。Godot定义稳定JSON编码，不声称直接读写JS存档；对齐测试比较规则状态/事件、ASTRA_CONTENT_V1关卡哈希和奖励token推导。先写 `.tmp`、验证、再替换，保留上一有效版本。

普通命令写失败：拒绝发布候选 state，不消费道具；平台完成的 observed 事件写失败：内存保留观察并标 dirty，后续普通命令必须先 flush，失败仍阻断。恢复必须验证校验和、重放命令、比较最终指纹；坏档提供错误提示并保留诊断，不静默赋予奖励。

保持现版恢复门槛：自动恢复 EARNED 待兑现奖励及待提交终局；普通进行中的存档、未确认首次失败不自动续局。WAITING不能因重启变为EARNED。成绩提交失败重试同一payload，ticketId+相同payload签名返回已接受结果；同ticket不同payload拒绝冲突。已接受结果先查再验周期，跨午夜丢响应重试仍成功；尚未接受的旧票据拒绝过期。排名贡献按(userId,day,mode)去重，daily/topic分开；新票据的再次胜利仍保存attempts及个人历史，教学不计排名。

最后取牌日志已写成功而outbox写失败时，active记录仍可重放出同一终局，并按原ticket/log/elapsed重建待发payload；不能因为缺outbox回到新局。服务已接受结果后，清active或outbox任一步失败都保留可重试记录；重试使用原payload，幂等结果不重复贡献，记录全部清理成功后才解除待结算门槛。

## 组件与接口

`rules/` 为无SceneTree纯逻辑：deal_loader、blocker_graph、board_reducer、round_reducer。`session/` 负责命令编号、revision、写盘先后、reward_adapter和settlement。`presentation/` 只读 state 和事件，负责tile_view、animation_director、input_gate；`scenes/` 负责主页、教学/棋盘、模态和本地社交面板。任何表现节点都不能直接修改 reducer state。

素材复用清单：`assets/theme/{home,board,characters,components,primary,user-cards}.png`、`manifest.json`、`user-cards-index.json`、`fonts/ZCOOLKuaiLe-Regular.ttf`和`fonts/OFL.txt`，三份`examples/deal-{270,540,720}.json`，profile/皮肤/弹幕/catalog配置。切片按manifest保留，弹窗面板和部分图标在Godot重建节点，不把并不存在的弹窗位图列为复用资源。音频复用隔离构建产物`wechat_full/audio/{click,clear,win,fail,music}.wav`，由原build-full生成并记录构建来源；不改原仓构建。复制时记录源commit、相对路径、SHA256及现有license/说明；不使用旧ui-preview PNG作为运行画面或新卡牌纹理。

标题使用现有ZCOOL KuaiLe字体；正文先复用同一字体并检查所有中文文案、数字、标点的glyph覆盖。若缺字，新增[静态Noto Sans CJK SC Regular 2.004](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004)作为正文fallback，保留官方OFL许可及来源；不复制本机Windows系统字体进可分发项目。

旧characters.png只作为角色替换的基线/来源参考，最终活跃角色资源必须来自已批准的新角色方案；旧功能图标代码也只作为语义映射参考。六张源图中的背景、卡牌、牌框、主按钮可继续复用，若整体UI样张要求替换组件须在视觉门明确。字体OFL只授权该字体，不覆盖用户上传图、生成素材或整仓历史资料；保留assets/theme/README.md和正式素材替换说明。manifest只使用20个图案中的前15个，余5个备用，tiles.png是旧备份，不激活。

## 数据复用与未迁移服务清单

只复制静态素材、固定deal与显式配置，导入工具接受只读`sourceRoot`和独立`projectRoot`，拒绝输出指向原仓、原仓子目录或输入文件自身。复制清单与哈希保存在新项目；原模块通过测试oracle只读调用，不作为产品运行依赖。JS源代码仅为迁移参考，不直接拷贝整个网页或wechat_full执行包。

首版新建独立local userId，Godot存档、教学完成、皮肤、个人记录、本地榜单从新档开始。**不导入**浏览器`sheep-full-012`存储、现有`local-data/social.json`、登录token、旧票据或待发奖励。若未来需要搬迁用户进度，单独设计用户主动导出、版本检查、备份、只迁移可信非交易字段的流程；本阶段不默默迁移。

原`createSocial`开发模拟规则在Godot `LocalGameService`中保留：bootstrap/start/settle/equip/bullet、本地ticket、UTC+8周期、奖励验证标记、地区/话题贡献去重和皮肤解锁。只改传输与存储形式，不把这些本地结果称为生产排名。HTTP loopback server、`/api/login`临时token、`/api/call`、Origin/Host防护、Node进程与浏览器音频/存储包装不迁入Godot；它们不是被遗漏的玩法规则，而是JS开发宿主和传输适配。

新空库不添虚拟玩家：totals/各地区wins和attempts为0、topic scores=[0,0]、荣誉与历史为空；profile.id为新local userId，name为“本地玩家”、region=REGIONS[0]、skin=plain、owned=[plain]、tutorialDone=false。history.wins按每日通关不同日期计数，records保存三模式真实结算；围巾要求自己昨日topic胜利且本人阵营严格胜出，平局不解锁。ticket字段为`{id,userId,mode,day,createdAt,expiresAt,dealId,index,region}`，提交仅`{ticketId,log,elapsedMs}`，不接受客户端任意宣称WON。

微信`wx`登录、真实激励广告、真实分享、开放数据域好友、云存储、游戏圈和震动需独立adapter及平台能力检测，本阶段全列为未接入/未真机验证。广告与分享按钮仅接明示模拟器；不产生真实收益、不统计verifiedShares、不发送外部消息。完整关卡生成器和生产服务端验证另起后续规格，当前保留三份固定、已验证关卡。

## 验收及确认点

第一阶段验收须覆盖：被挡牌拒绝、侧堆顶牌、暂存任取、七格形成三消仍存活、七格无三消失败、全清胜利、四道具及一次配额、奖励取消与重复callback、写盘失败不消费、EARNED/终局恢复、结算响应丢失去重、后台/resize取消输入、减少动效。需要实际从主页自然教学→每日对局→失败/复活及小fixture胜利，再拍原生Godot画面；fixture需标明，不冒充每日通关。

已确认的**具体迁移规格**是：本地Windows第一阶段、完整玩法+本地社交、输入不排队、现版恢复门槛、固定JSON关卡、增强动效及微信单独验证。首页/棋盘视觉样张仍需单独确认；不依赖该视觉选择的规则和存储工作继续推进。

## 源码依据

全部相对路径均指上述精确commit：[源码树](https://github.com/ldld1085586454-svg/weimeng-laoshu-bu-le-ge-bu/tree/362c61027b7a7f7e573f4b28608e3b3098e2092a)。`src/layout.js:5–33`（遮挡），`src/product/board.js:39–96`（选牌/道具/胜负），`src/product/effects.js:5–19`（复活），`src/product/round.js:35–115`（命令/奖励/回放），`src/product/controller.js:10–18`（写盘先后），`ui/product/app.js:195–219,261–290`（动效/输入/恢复），`src/product/social.js:42–45`、`catalog.js:3–9`（每日），`src/generator.js:18–48`、`src/random.js:7–22`（生成），`templates/wechat-full/preview-config.js`、`README.md:55`（微信未验）。
