extends RefCounted
## Pure native-page models from LocalGameService bootstrap data.
## The router performs actions; the view owns paging and navigation.

const LOCAL_SCOPE := "本地开发数据"
const SKIN_NAMES := {"plain": "普通萝卜", "cap": "小黄帽萝卜", "scarf": "围巾萝卜"}
const MODE_NAMES := {"tutorial": "新手教学", "daily": "每日挑战", "topic": "话题挑战"}
const STATUS_NAMES := {"WON": "胜利", "LOST": "失败"}
const PAGE_NAMES := {"rank": "地区排行榜", "friends": "好友", "topic": "话题对战", "honor": "昨日荣誉", "profile": "我的萝卜", "wardrobe": "萝卜装扮", "club": "俱乐部", "bullet": "预设弹幕", "about": "关于游戏"}

func render(info: Dictionary, page: String) -> Dictionary:
	var model := {"title": PAGE_NAMES.get(page, "页面不存在"), "subtitle": LOCAL_SCOPE, "rows": [], "actions": []}
	match page:
		"rank":
			_rank(info, model)
		"friends":
			model.rows.append(_row("微信好友未接入", "本地开发数据暂无好友列表", "friends", true))
		"topic":
			_topic(info, model)
		"honor":
			_honor(info, model)
		"profile":
			_profile(info, model)
		"wardrobe":
			_wardrobe(info, model)
		"club":
			model.rows.append(_row("俱乐部未接入", "本地开发数据暂无俱乐部成员", "club", true))
		"bullet":
			_bullet(info, model)
		"about":
			model.rows.append(_row("卜了个卜", "使用现有萝卜样张与用户选择的牌面素材", "profile"))
			model.rows.append(_row("本地开发版本", "当前记录仅保存在此设备，未接入微信服务", "settings"))
			model.rows.append(_row("每日挑战", "当前日期 " + str(info.get("day", "暂无")) + " · 每日切换挑战", "topic"))
			model.rows.append(_row("角色动画", "已接入呼吸、眨眼和反馈；草帽、围巾解锁后可装备", "wardrobe"))
		_:
			model.rows.append(_row("页面不存在", "请返回首页选择现有功能", "back", true))
	return model

func _rank(info: Dictionary, model: Dictionary) -> void:
	var totals: Dictionary = info.get("totals", {})
	model.subtitle += " · " + str(info.get("day", "暂无日期")) + " · 通关 " + str(totals.get("wins", 0)) + " / 挑战 " + str(totals.get("attempts", 0))
	var regions: Array = info.get("regions", [])
	for index in range(regions.size()):
		var region: Dictionary = regions[index]
		model.rows.append(_row(str(index + 1) + " · " + str(region.get("name", "")), "通关 " + str(region.get("wins", 0)) + " · 挑战 " + str(region.get("attempts", 0)), "rank"))
	if regions.is_empty():
		model.rows.append(_row("地区排行榜", "暂无地区数据", "rank", true))

func _topic(info: Dictionary, model: Dictionary) -> void:
	var topic: Dictionary = info.get("topic", {})
	model.subtitle += " · " + str(info.get("day", "暂无日期"))
	if topic.get("sampleContent", false):
		model.subtitle += " · 示例话题"
	model.rows.append(_row(str(topic.get("title", "暂无话题")), "本地话题挑战" if not topic.is_empty() else "暂无话题数据", "topic", topic.is_empty()))
	var labels: Array = topic.get("labels", [])
	var scores: Array = topic.get("scores", [])
	for index in range(mini(labels.size(), scores.size())):
		var text := str(labels[index])
		if index == topic.get("team", -1):
			text += " · 我的阵营"
		model.rows.append(_row(text, "通关 " + str(scores[index]), "topic"))
	var previous: Array = topic.get("previousScores", [])
	if previous.size() == 2:
		model.rows.append(_row("昨日阵营战绩", str(previous[0]) + " : " + str(previous[1]), "rank"))
	if topic.get("won", false):
		model.rows.append(_row("今日已通关", "本地话题贡献已记录", "rank"))
	model.actions.append(_action("topic-start", "参加话题挑战", not str(topic.get("id", "")).is_empty() and not info.get("profile", {}).is_empty()))

func _honor(info: Dictionary, model: Dictionary) -> void:
	var honors: Dictionary = info.get("honors", {})
	model.subtitle += " · " + str(honors.get("day", "暂无日期"))
	for entry in [{"key": "first", "name": "首胜萝卜"}, {"key": "king", "name": "萝卜王"}, {"key": "fast", "name": "竞速萝卜"}]:
		var winner: Variant = honors.get(entry.key)
		var row: Dictionary
		if winner is Dictionary and not winner.is_empty():
			row = _row(entry.name, str(winner.get("name", "")) + " · " + str(winner.get("region", "")) + " · " + _duration(winner.get("elapsedMs", 0)), "rank")
		else:
			row = _row(entry.name, "昨日暂无符合条件的真实记录", "rank", true)
		row.skin = "plain"
		model.rows.append(row)

func _profile(info: Dictionary, model: Dictionary) -> void:
	var profile: Dictionary = info.get("profile", {})
	var history: Dictionary = info.get("history", {})
	model.rows.append(_row(str(profile.get("name", "我的萝卜")), "本地玩家 · " + str(profile.get("id", "暂无玩家信息")), "profile", profile.is_empty()))
	model.rows.append(_row("所在地区", str(profile.get("region", "暂无地区信息")), "locate", profile.is_empty()))
	model.rows.append(_row("每日通关天数", str(history.get("wins", 0)) + " 天", "rank"))
	var records: Array = history.get("records", [])
	for record in records:
		var mode: String = str(record.get("mode", ""))
		var status: String = str(record.get("status", ""))
		model.rows.append(_row(str(record.get("day", "")) + " · " + str(MODE_NAMES.get(mode, mode)), str(STATUS_NAMES.get(status, status)) + " · 用时 " + _duration(record.get("elapsedMs", 0)), "topic"))
	if records.is_empty():
		model.rows.append(_row("挑战记录", "暂无已结算的真实挑战记录", "topic", true))

func _wardrobe(info: Dictionary, model: Dictionary) -> void:
	model.subtitle += " · 草帽 / 围巾解锁后可装备"
	var profile: Dictionary = info.get("profile", {})
	var skins: Array = info.get("skins", [])
	for skin in skins:
		var id: String = str(skin.get("id", ""))
		if not SKIN_NAMES.has(id):
			continue
		var owned: bool = skin.get("owned", false)
		var equipped: bool = str(profile.get("skin", "")) == id
		var detail := "已装备" if equipped else ("已拥有" if owned else str(skin.get("requirement", "尚未解锁")))
		var row := _row(SKIN_NAMES[id], detail, "wardrobe", not owned)
		row.skin = id
		model.rows.append(row)
		model.actions.append(_action("equip:" + id, "已装备" if equipped else "装备" + SKIN_NAMES[id], owned and not equipped))
	if model.rows.is_empty():
		model.rows.append(_row("萝卜装扮", "暂无装扮数据", "wardrobe", true))

func _bullet(info: Dictionary, model: Dictionary) -> void:
	for preset in info.get("presetBullets", []):
		var id: String = str(preset.get("id", ""))
		var text: String = str(preset.get("text", ""))
		model.rows.append(_row(text, "预设弹幕", "bullet"))
		model.actions.append(_action("send-bullet:" + id, text, not id.is_empty() and not info.get("profile", {}).is_empty()))
	for bullet in info.get("bullets", []):
		model.rows.append(_row(str(bullet.get("name", "")) + "：" + str(bullet.get("text", "")), "已发送 · " + str(bullet.get("day", "")), "bullet"))
	if model.rows.is_empty():
		model.rows.append(_row("预设弹幕", "暂无弹幕数据", "bullet", true))

func _duration(elapsed_ms: Variant) -> String:
	var milliseconds := maxi(0, int(elapsed_ms))
	if milliseconds < 60000:
		return "%.3f秒" % (milliseconds / 1000.0)
	@warning_ignore("integer_division")
	var minutes := milliseconds / 60000
	return "%d分%06.3f秒" % [minutes, (milliseconds % 60000) / 1000.0]

func _row(text: String, detail: String, icon: String, disabled := false) -> Dictionary:
	return {"text": text, "detail": detail, "icon": icon, "disabled": disabled}

func _action(id: String, label: String, enabled: bool) -> Dictionary:
	return {"id": id, "label": label, "enabled": enabled}
