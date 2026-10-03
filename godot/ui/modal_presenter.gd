extends Control

signal action_requested(id: String)

const Mascot = preload("res://presentation/mascot_view.gd")
const Assets = preload("res://presentation/theme_assets.gd")
const TITLES := {
	"LOAD_ERROR": "读取遇到问题", "ERROR": "操作未完成", "SETTINGS": "设置",
	"TOPIC": "话题挑战", "EXIT": "退出对局？", "OFFER": "获得道具机会",
	"PROVIDER": "本地奖励模拟", "RECOVERY": "继续使用道具", "REVIVE": "要再试一次吗？",
	"TUTORIAL_WIN": "教学完成！", "WIN": "恭喜通关！", "LOSE": "本局结束",
	"SETTLEMENT_ERROR": "保存遇到问题", "SETTLEMENT_PENDING": "正在保存成绩", "EXPIRED": "本轮已过期"
}
const ALIASES := {
	"WON": "WIN", "LOST": "LOSE", "EXIT_CONFIRM": "EXIT",
	"REWARD_OFFER": "OFFER", "REWARD_WAITING": "PROVIDER", "REWARD_EARNED": "RECOVERY"
}
const LABELS := {
	"start": "加入挑战", "next-daily": "准备好了", "topic-start": "开始话题挑战",
	"return-home": "返回主页", "restart": "再来一局", "exit": "退出对局",
	"cancel-exit": "继续对局", "confirm-exit": "确认退出", "grant": "开始本地模拟",
	"cancel-offer": "暂时不用", "recover-grant": "恢复并使用", "revive": "复活",
	"give-up": "结束本局", "dev-complete": "完成模拟", "dev-cancel": "提前关闭",
	"dev-fail": "模拟失败", "retry-settlement": "重试保存", "expired-home": "返回主页",
	"retry-load": "重新读取", "close": "关闭"
}
const SETTINGS := {"music": "音乐", "sound": "音效", "vibration": "震动", "bullets": "弹幕", "reducedMotion": "减少动效"}
const ASSISTS := {"move": "移出", "undo": "撤回", "shuffle": "洗牌", "revive": "复活"}

var overlay: ColorRect
var panel: Panel
var title_label: Label
var message_label: Label
var mascot: Control
var _mascot_kind := ""
var action_buttons: Dictionary = {}
var _assets: RefCounted = Assets.new()
var _generation := 0

func _init() -> void:
	name = "NativeModal"
	size = Vector2(430, 932)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 200
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var native_theme := Theme.new()
	native_theme.default_font = _assets.font()
	native_theme.default_font_size = 18
	theme = native_theme
	overlay = ColorRect.new()
	overlay.name = "InputBlocker"
	overlay.size = size
	overlay.color = Color(0.08, 0.14, 0.10, 0.64)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(overlay)
	panel = Panel.new()
	panel.name = "ModalPanel"
	panel.position = Vector2(25, 100)
	panel.size = Vector2(380, 770)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.add_theme_stylebox_override("panel", _style(Assets.CREAM, Assets.BORDER))
	add_child(panel)
	title_label = Label.new()
	title_label.name = "Title"
	title_label.position = Vector2(20, 18)
	title_label.size = Vector2(246, 38)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_label.add_theme_font_size_override("font_size", 25)
	title_label.add_theme_color_override("font_color", Assets.INK)
	panel.add_child(title_label)
	var message_scroll := ScrollContainer.new()
	message_scroll.name = "MessageScroll"
	message_scroll.position = Vector2(20, 180)
	message_scroll.size = Vector2(340, 100)
	message_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	message_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.add_child(message_scroll)
	message_label = Label.new()
	message_label.name = "Message"
	message_label.custom_minimum_size = Vector2(320, 0)
	message_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	message_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	message_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	message_label.add_theme_color_override("font_color", Assets.INK)
	message_scroll.add_child(message_label)
	mascot = Mascot.new()
	mascot.name = "Radish"
	mascot.position = Vector2(152, 62)
	mascot.size = Vector2(76, 102)
	mascot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(mascot)
	hide()

func show_modal(kind: String, model: Dictionary) -> void:
	_generation += 1
	_clear_buttons()
	var canonical: String = ALIASES.get(kind, kind)
	title_label.text = TITLES.get(canonical, "温馨提示")
	message_label.text = _message(canonical, model)
	var prefs: Dictionary = model.get("prefs", model)
	mascot.set_reduced_motion(prefs.get("reducedMotion", false))
	mascot.set_appearance(model.get("skin", "plain"), "modal")
	if canonical != _mascot_kind:
		_mascot_kind = canonical
		mascot.cancel_and_snap()
		if canonical in ["WIN", "TUTORIAL_WIN"]:
			mascot.play("win")
		elif canonical in ["REVIVE", "LOSE"]:
			mascot.play("fail")
		elif canonical == "RECOVERY":
			mascot.play("revive")
	var row := 0
	for action in model.get("actions", []):
		if not action is String and not action is Dictionary:
			continue
		var id: String = str(action.get("id", "")) if action is Dictionary else str(action)
		if id.is_empty() or action_buttons.has(id):
			continue
		var button := Button.new()
		button.name = "Action_" + id
		button.text = _action_label(id, prefs)
		if action is Dictionary:
			button.text = str(action.get("label", button.text))
			button.disabled = not bool(action.get("enabled", true))
		button.position = Vector2(264, 10) if id == "close" else Vector2(20, 300 + row * 58)
		button.size = Vector2(96, 48) if id == "close" else Vector2(340, 52)
		button.custom_minimum_size = button.size
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		button.expand_icon = true
		button.add_theme_constant_override("icon_max_width", 24)
		button.add_theme_constant_override("h_separation", 10)
		button.add_theme_font_size_override("font_size", 18)
		var minor: bool = id in ["close", "cancel-exit", "cancel-offer", "dev-cancel", "dev-fail", "give-up", "return-home"] or id.begins_with("setting-")
		button.add_theme_stylebox_override("normal", _style(Assets.GRASS if minor else Assets.GREEN, Assets.BORDER))
		button.add_theme_stylebox_override("hover", _style(Color("e0ebd3") if minor else Color("466747"), Assets.GREEN))
		button.add_theme_stylebox_override("pressed", _style(Color("ccddbb"), Assets.GREEN))
		button.add_theme_stylebox_override("disabled", _style(Color("e4e7df"), Assets.BORDER))
		button.add_theme_color_override("font_color", Assets.INK if minor else Assets.CREAM)
		button.add_theme_color_override("font_hover_color", Assets.INK if minor else Assets.CREAM)
		button.add_theme_color_override("font_pressed_color", Assets.INK)
		button.add_theme_color_override("font_disabled_color", Assets.MUTED)
		button.add_theme_color_override("icon_normal_color", Assets.INK if minor else Assets.CREAM)
		button.add_theme_color_override("icon_hover_color", Assets.INK if minor else Assets.CREAM)
		button.add_theme_color_override("icon_pressed_color", Assets.INK)
		button.add_theme_color_override("icon_disabled_color", Assets.MUTED)
		var icon_key := _icon_key(id, prefs, model)
		if not icon_key.is_empty():
			button.icon = _assets.icon(icon_key)
		button.pressed.connect(_request_action.bind(id, _generation))
		panel.add_child(button)
		action_buttons[id] = button
		if id != "close": row += 1
	show()

func close_modal() -> void:
	_mascot_kind = ""
	mascot.cancel_and_snap()
	_generation += 1
	_clear_buttons()
	hide()

func _clear_buttons() -> void:
	for button in action_buttons.values():
		# Router actions can redraw/close synchronously inside Button.pressed.
		# Retire input immediately, then free after the emitter is unlocked.
		button.hide()
		button.disabled = true
		button.queue_free()
	action_buttons.clear()

func _request_action(id: String, generation: int) -> void:
	if generation != _generation or not is_visible_in_tree() or not action_buttons.has(id):
		return
	var button: Button = action_buttons[id]
	if not button.disabled:
		action_requested.emit(id)

func _action_label(id: String, prefs: Dictionary) -> String:
	if id.begins_with("setting-"):
		var key := id.trim_prefix("setting-")
		return str(SETTINGS.get(key, "设置")) + "：" + ("开" if prefs.get(key, false) else "关")
	return LABELS.get(id, "继续")

func _icon_key(id: String, prefs: Dictionary, model: Dictionary) -> String:
	match id:
		"close": return "close"
		"return-home", "expired-home", "cancel-exit": return "back"
		"topic-start": return "topic"
		"revive": return "revive"
		"setting-music": return "music"
		"setting-sound": return "volume" if prefs.get("sound", true) else "mute"
		"setting-bullets": return "bullet"
		"grant", "recover-grant":
			var pending: Dictionary = model.get("pending", {})
			var assist: String = str(pending.get("assist", ""))
			return assist if ASSISTS.has(assist) else ""
	return ""

func _message(kind: String, model: Dictionary) -> String:
	if model.get("message") is String and not model.message.is_empty():
		return model.message
	var pending: Dictionary = model.get("pending", {})
	var assist: String = ASSISTS.get(str(pending.get("assist", "")), "道具")
	var saved := "成绩已保存。" if model.get("saved", false) else "成绩尚未保存。"
	match kind:
		"SETTINGS": return "按下开关即可调整。" + ("\n设置未能保存，请重试。" if not str(model.get("error", "")).is_empty() else "")
		"TOPIC": return "参与今日话题挑战。\n当前使用本地数据，未接入微信。"
		"EXIT": return "退出将结束当前对局。\n确定要返回主页吗？"
		"OFFER": return "获得一次" + assist + "机会。\n这是本地模拟，未接入真实广告或分享。"
		"PROVIDER": return "本地模拟进行中。请选择完成、提前关闭或失败；这不是真实广告或分享。"
		"RECOVERY": return "你已获得" + assist + "机会，请继续恢复并使用。\n奖励来自本地模拟。"
		"REVIVE": return "槽位已满。你可以使用本局的一次复活，或结束本局。"
		"TUTORIAL_WIN": return "你已完成教学！" + saved + "\n准备好进入每日挑战了吗？"
		"WIN": return "所有牌都已消除！\n" + saved
		"LOSE": return "这次挑战结束了。\n" + saved
		"SETTLEMENT_ERROR": return "成绩尚未保存。\n请重试完成保存。"
		"SETTLEMENT_PENDING": return "成绩正在保存，请稍候。"
		"EXPIRED": return "本轮挑战已过期。\n请返回主页重新开始。"
		"LOAD_ERROR": return "数据未能读取。\n请重试。"
		"ERROR": return "这次操作未完成。\n请重试。"
	return "请选择下一步。"

func _style(fill: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(16)
	box.content_margin_left = 12
	box.content_margin_right = 12
	return box
