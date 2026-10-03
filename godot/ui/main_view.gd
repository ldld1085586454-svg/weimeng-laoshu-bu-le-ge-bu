extends Node2D
## Native presentation of the real router/session. No gameplay state is injected.

const Assets = preload("res://presentation/theme_assets.gd")
const Tile = preload("res://presentation/tile_view.gd")
const Gate = preload("res://presentation/input_gate.gd")
const Director = preload("res://presentation/animation_director.gd")
const Audio = preload("res://presentation/audio_director.gd")
const Mascot = preload("res://presentation/mascot_view.gd")
const Board = preload("res://rules/board_reducer.gd")
const SIZE := Vector2(430, 932)

var mascot: Control
var honor_mascots: Array = []
var router: Node
var director: Node
var audio: Node
var gate: RefCounted = Gate.new()
var assets: RefCounted = Assets.new()
var modal_view: Control
var buttons: Dictionary = {}
var tile_views: Dictionary = {}
var tile_rects: Dictionary = {}
var hit_tiles: Array = []
var model: Dictionary = {}
var frame: Dictionary = {}
var card_layer := Control.new()
var button_layer := Control.new()
var _round_id := ""
var _social_page := 0
var _press_id := ""
var _press_elapsed := 120.0
var _focused := true
var _resumed := true
var _elapsed_redraw := 0.0
var _last_modal := ""
var _origins: Dictionary = {}
var _side_names: Array = []
var _pointers: Dictionary = {}
var _multi_cancelled := false
var _automation := "--native-playthrough" in OS.get_cmdline_user_args()
var _button_generation := 0
var _panel_preview_identity := ""

func _ready() -> void:
	get_tree().auto_accept_quit = false
	if _automation:
		get_window().set_flag(Window.FLAG_NO_FOCUS, true)
	mascot = Mascot.new()
	mascot.name = "LivingRadish"
	mascot.z_index = 3
	add_child(mascot)
	for n in range(3):
		var honor := Mascot.new()
		honor.position = Vector2(63 + n * 132, 157)
		honor.size = Vector2(40, 43)
		honor.set_appearance("plain", ["first", "king", "fast"][n])
		honor.z_index = 3
		add_child(honor)
		honor_mascots.append(honor)
	card_layer.name = "Cards"
	card_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card_layer.z_index = 1
	add_child(card_layer)
	button_layer.name = "Buttons"
	button_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button_layer.z_index = 10
	add_child(button_layer)
	modal_view = load("res://scenes/modal.tscn").instantiate()
	modal_view.z_index = 30
	add_child(modal_view)
	if router == null:
		router = load("res://ui/app_router.gd").new()
	add_child(router)
	director = Director.new()
	add_child(director)
	director.configure(_render_transition, _snap)
	director.board_lock_changed.connect(_animation_lock)
	director.presentation_finished.connect(router.presentation_finished)
	audio = Audio.new()
	add_child(audio)
	modal_view.action_requested.connect(_action)
	router.changed.connect(_refresh)
	router.session.committed.connect(_committed)
	get_viewport().size_changed.connect(_resized)
	router.initialize()
	_refresh()
	if _automation and not get_tree().has_meta("native_qa_running"):
		get_tree().set_meta("native_qa_running", true)
		var qa = load("res://tools/native_playthrough.gd").new()
		add_child(qa)
		qa.run(self)

func _refresh() -> void:
	if not is_instance_valid(router):
		return
	model = router.snapshot()
	_refresh_mascot()
	var current_id := str(model.get("state", {}).get("roundId", ""))
	if current_id != _round_id:
		gate.cancel_all("next_round")
		_pointers.clear()
		_multi_cancelled = false
		_press_id = ""
		_round_id = current_id
		_clear_cards()
		_build_geometry()
		director.cancel_and_snap(model.get("state", {}))
		mascot.cancel_and_snap()
	var modal: Dictionary = model.get("modal", {})
	var kind := str(modal.get("kind", ""))
	if kind != _last_modal:
		gate.cancel_all("modal")
		_pointers.clear()
		_multi_cancelled = false
		_press_id = ""
		_last_modal = kind
	if modal.is_empty():
		modal_view.close_modal()
	else:
		_panel_preview_identity = ""
		var contents: Dictionary = modal.get("model", {}).duplicate(true)
		contents.actions = modal.get("actions", []).duplicate(true)
		contents.prefs = model.get("prefs", {})
		contents.error = model.get("error", "")
		contents.skin = model.get("info", {}).get("profile", {}).get("skin", "plain")
		if kind == "SETTINGS" and not audio.vibration_supported():
			contents.message = "点按开关即可调整。\n当前设备不支持震动，开关仅保存偏好。"
		modal_view.show_modal(kind, contents)
		modal_view.modulate.a = 1.0
	audio.apply_preferences(model.get("prefs", {}))
	audio.set_context(model.get("screen", ""), kind, _focused and _resumed)
	_sync_lock()
	_rebuild_buttons()
	_layout_cards()
	queue_redraw()

func _refresh_mascot() -> void:
	var screen: String = model.get("screen", "home")
	var reduced: bool = model.get("prefs", {}).get("reducedMotion", false)
	mascot.visible = screen in ["home", "play"]
	mascot.position = Vector2(92, 260) if screen == "home" else Vector2(27, 74)
	mascot.size = Vector2(246, 307) if screen == "home" else Vector2(58, 61)
	mascot.set_appearance(model.get("info", {}).get("profile", {}).get("skin", "plain"), "home" if screen == "home" else "board")
	mascot.set_reduced_motion(reduced)
	for honor in honor_mascots:
		honor.visible = screen == "home"
		honor.set_reduced_motion(reduced)

func _committed(before: Dictionary, after: Dictionary, events: Array) -> void:
	mascot.consume_committed(after, events)
	_origins.clear()
	for id in tile_views:
		if tile_views[id].visible:
			_origins[id] = tile_views[id].logical_rect
	for i in range(events.size()):
		var cue: String = {"TAKE": "click", "CLEAR": "clear", "WON": "win", "LOST": "fail"}.get(events[i].get("type", ""), "")
		if not cue.is_empty():
			audio.play_event(cue, "%s:%s:%s" % [after.roundId, after.revision, i])
	director.play_transition(before, after, events, model.get("prefs", {}).get("reducedMotion", false))

func _render_transition(next_frame: Dictionary) -> void:
	frame = next_frame
	_layout_cards()
	var pending: Dictionary = model.get("panel_pending", {})
	if frame.get("panel_visible", false) and not pending.is_empty() and model.get("modal", {}).is_empty():
		var identity := str(pending.roundId) + ":" + str(pending.revision)
		if identity != _panel_preview_identity:
			_panel_preview_identity = identity
			var contents: Dictionary = pending.model.duplicate(true)
			contents.prefs = model.get("prefs", {})
			contents.skin = model.get("info", {}).get("profile", {}).get("skin", "plain")
			contents.actions = []
			for id in pending.actions:
				contents.actions.append({"id": id, "enabled": false})
			modal_view.show_modal(pending.kind, contents)
		modal_view.modulate.a = frame.get("panel", 1.0)
	queue_redraw()

func _snap(_state: Dictionary) -> void:
	frame = {}
	_layout_cards()
	queue_redraw()

func _animation_lock(value: bool) -> void:
	router.set_presentation_locked(value)
	_sync_lock()
	_rebuild_buttons()

func _sync_lock() -> void:
	gate.set_board_locked((_multi_cancelled and not _pointers.is_empty()) or not _focused or not _resumed or model.get("screen") != "play" or not model.get("modal", {}).is_empty() or model.get("pending", false) or director.is_board_locked())

func _process(delta: float) -> void:
	_press_elapsed += delta * 1000.0
	if _press_elapsed < 120.0:
		_layout_cards()
	_elapsed_redraw += delta
	if _elapsed_redraw > .2:
		_elapsed_redraw = 0
		queue_redraw()

func _input(event: InputEvent) -> void:
	if not is_instance_valid(router) or model.get("screen") != "play":
		return
	if event is InputEventMouseMotion or event is InputEventScreenDrag:
		if not _pointers.is_empty() and not _multi_cancelled and not _press_id.is_empty() and tile_at(event.position) != _press_id:
			gate.cancel_all("drag_out")
			_press_id = ""
			_layout_cards()
		return
	var pointer := -2
	var at := Vector2.ZERO
	var down := false
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		pointer = -1
		at = event.position
		down = event.pressed
	elif event is InputEventScreenTouch:
		if event.canceled:
			gate.cancel_all("touch_canceled")
			_pointers.erase(event.index)
			_multi_cancelled = not _pointers.is_empty()
			_press_id = ""
			_sync_lock()
			_layout_cards()
			return
		pointer = event.index
		at = event.position
		down = event.pressed
	else:
		return
	var target := tile_at(at)
	if down:
		gate.press(pointer, target, _round_id)
		_pointers[pointer] = true
		_multi_cancelled = _multi_cancelled or _pointers.size() > 1
		_press_id = "" if _multi_cancelled else target
		_press_elapsed = 0
	else:
		var released: Dictionary = gate.release(pointer, target, _round_id)
		_pointers.erase(pointer)
		if _pointers.is_empty():
			_multi_cancelled = false
		_press_elapsed = 55
		if released.ok:
			router.pick(released.target_id)
		elif not target.is_empty():
			_press_id = ""
	_sync_lock()
	_layout_cards()

func tile_at(at: Vector2) -> String:
	for i in range(hit_tiles.size() - 1, -1, -1):
		var hit: Dictionary = hit_tiles[i]
		if hit.rect.has_point(at):
			return hit.id if hit.enabled else ""
	return ""

func _notification(what: int) -> void:
	if not is_instance_valid(router):
		return
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		if router.prepare_quit().ok:
			get_tree().quit()
		return
	if _automation and what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_APPLICATION_FOCUS_IN]:
		return
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_focused = false
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_focused = true
	elif what == NOTIFICATION_APPLICATION_PAUSED:
		_resumed = false
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		_resumed = true
	else:
		return
	_cancel_visual("hidden")
	router.set_visible(_focused and _resumed)
	_refresh()

func _resized() -> void:
	_cancel_visual("resize")

func _cancel_visual(reason: String) -> void:
	var status: String = model.get("state", {}).get("board", {}).get("status", "")
	mascot.cancel_and_snap({"WON": "win", "LOST": "fail"}.get(status, "idle"))
	mascot.set_process(_focused and _resumed)
	modal_view.mascot.cancel_and_snap(modal_view.mascot.pose().expression)
	modal_view.mascot.set_process(_focused and _resumed)
	for honor in honor_mascots:
		honor.cancel_and_snap()
		honor.set_process(_focused and _resumed)
	gate.cancel_all(reason)
	_pointers.clear()
	_multi_cancelled = false
	_press_id = ""
	var pending: Dictionary = model.get("panel_pending", {})
	director.cancel_and_snap(model.get("state", {}))
	if not pending.is_empty():
		router.presentation_finished(pending.get("roundId", _round_id), int(pending.get("revision", -1)))
	_sync_lock()

func _action(id: String) -> void:
	if id == "mascot-tap":
		mascot.play("tap")
		return
	gate.cancel_all("menu")
	_pointers.clear()
	_multi_cancelled = false
	if id.begins_with("menu:"):
		_social_page = 0
		var page := id.trim_prefix("menu:")
		router.open_menu("honor" if page.begins_with("honor-") else page)
	elif id == "settings":
		_cancel_visual("modal")
		router.open_settings()
	elif id.begins_with("assist:"):
		router.intent_assist(id.trim_prefix("assist:"))
	elif id == "page-prev" or id == "page-next":
		_social_page += -1 if id == "page-prev" else 1
		_rebuild_buttons()
		queue_redraw()
	else:
		router.action(id)

func _clear_cards() -> void:
	for view in tile_views.values():
		view.free()
	tile_views.clear()
	tile_rects.clear()
	hit_tiles.clear()

func _build_geometry() -> void:
	var state: Dictionary = model.get("state", {})
	if state.is_empty():
		return
	var cells: Array = state.board.deal.cells
	_side_names.clear()
	for c in cells:
		if c.zone == "side" and c.stackId not in _side_names:
			_side_names.append(c.stackId)
	_side_names.sort()
	var central: Array = cells.filter(func(c): return c.zone == "board")
	var bounds := Rect2()
	for c in central:
		var r: Dictionary = c.rect
		var next := Rect2(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3)
		bounds = next if bounds.size == Vector2.ZERO else bounds.merge(next)
	var sx := minf(390.0 / bounds.size.x, 358.0 / (bounds.size.y * 1.25))
	var sy := sx * 1.25
	var offset := Vector2((430 - bounds.size.x * sx) / 2.0 - bounds.position.x * sx, 178 - bounds.position.y * sy)
	for c in cells:
		if c.zone == "board":
			var r: Dictionary = c.rect
			tile_rects[c.id] = Rect2(offset + Vector2((r.x - 1.5) * sx, (r.y - 1.5) * sy), Vector2((r.w + 3) * sx, (r.h + 3) * sy))
		var view = Tile.new()
		view.set_theme_assets(assets)
		card_layer.add_child(view)
		view.hide()
		tile_views[c.id] = view

func _layout_cards() -> void:
	for view in tile_views.values():
		view.hide()
	hit_tiles.clear()
	if model.get("screen") != "play" or model.get("state", {}).is_empty():
		return
	var state: Dictionary = frame.get("after", model.state)
	var board: Dictionary = state.board
	var ordered: Array = board.deal.cells.filter(func(c): return c.zone == "board")
	ordered.sort_custom(func(a, b): return a.z < b.z if a.z != b.z else a.id < b.id)
	for c in ordered:
		var index: int = board.byId[c.id]
		if c.zone == "board" and not board.taken[index]:
			_place(c.id, board, tile_rects[c.id], board.blockers[index] == 0)
	var stacks: Dictionary = {}
	for c in board.deal.cells:
		if c.zone == "side" and not board.taken[board.byId[c.id]]:
			if not stacks.has(c.stackId):
				stacks[c.stackId] = []
			stacks[c.stackId].append(c)
	var names: Array = _side_names
	for n in range(names.size()):
		if not stacks.has(names[n]):
			continue
		var stack: Array = stacks[names[n]]
		stack.sort_custom(func(a, b): return a.position > b.position)
		var top: int = stack[-1].position
		for c in stack:
			var depth := minf(c.position - top, 5)
			var x := 26.0 if n == 0 else 349.0
			_place(c.id, board, Rect2(x + (depth * -1.4 if n == 0 else depth * 1.4), 549 + depth * 1.3, 55, 51), c.position == top)
	for n in range(board.buffer.size()):
		_place(board.buffer[n], board, _buffer_rect(n, board.buffer.size()), true)
	var rack: Array = board.rack
	var take_id := ""
	var clear_ids: Array = []
	if not frame.is_empty():
		for event in frame.events:
			if event.type == "TAKE":
				take_id = event.id
			elif event.type == "CLEAR":
				clear_ids = event.ids
		if not take_id.is_empty() and frame.take < 1.0:
			rack = frame.before.board.rack.duplicate()
			var kind := Board.tile_type(board, take_id)
			var last := -1
			for n in range(rack.size()):
				if Board.tile_type(board, rack[n]) == kind:
					last = n
			rack.insert(rack.size() if last < 0 else last + 1, take_id)
		elif not clear_ids.is_empty() and frame.clear < 1.0:
			rack = frame.before.board.rack.duplicate()
			var last := -1
			for n in range(rack.size()):
				if Board.tile_type(board, rack[n]) == Board.tile_type(board, take_id):
					last = n
			rack.insert(rack.size() if last < 0 else last + 1, take_id)
	for n in range(rack.size()):
		var id: String = rack[n]
		var destination := _rack_rect(n)
		_place(id, board, destination, true, false)
		var view: Control = tile_views[id]
		if id == take_id and frame.get("take", 1.0) < 1.0:
			var start: Rect2 = _origins.get(id, destination)
			if id in frame.before.board.buffer:
				start = _buffer_rect(frame.before.board.buffer.find(id), frame.before.board.buffer.size())
			var t: float = frame.take
			view.set_visual_transform(Vector2.ONE, (start.get_center() - destination.get_center()) * (1.0 - t) + Vector2(0, -18 * sin(PI * t)), 1.0)
		elif id in clear_ids and frame.get("clear_active", false):
			var t: float = frame.clear
			view.set_visual_transform(Vector2.ONE * (1.0 - t * .42), Vector2(0, -8 * t), 1.0 - t)

func _place(id: String, board: Dictionary, rect: Rect2, enabled: bool, interactive := true) -> void:
	if not tile_views.has(id):
		return
	var view: Control = tile_views[id]
	var cell: Dictionary = board.deal.cells[board.byId[id]]
	if frame.get("shuffle_active", false) and frame.shuffle < .5 and not board.taken[board.byId[id]]:
		cell = frame.before.board.deal.cells[board.byId[id]]
	if view.tile_id != id or view.tile_type != cell.type or view.logical_rect != rect or view.enabled != enabled:
		view.bind(cell, rect, enabled)
	else:
		view.set_visual_transform(Vector2.ONE, Vector2.ZERO, 1)
	view.show()
	view.move_to_front()
	if frame.get("assist_active", false) and _origins.has(id):
		var from: Rect2 = _origins[id]
		view.set_visual_transform(Vector2.ONE, (from.get_center() - rect.get_center()) * (1.0 - frame.assist), 1)
	if interactive:
		hit_tiles.append({"id": id, "rect": rect, "enabled": enabled})
		if id == _press_id and _press_elapsed < 120.0 and not model.get("prefs", {}).get("reducedMotion", false):
			var amount := .94 if _press_elapsed < 55 else lerpf(1.04, 1.0, (_press_elapsed - 55) / 65.0)
			view.set_visual_transform(Vector2.ONE * amount, Vector2.ZERO, 1)
	if frame.get("shuffle_active", false):
		var flip: float = absf(cos(frame.shuffle * PI))
		view.set_visual_transform(Vector2(maxf(.05, flip), 1.0), Vector2.ZERO, .25 + .75 * flip)

func _rack_rect(n: int) -> Rect2:
	return Rect2(26 + n * 55, 674, 48, 57)

func _buffer_rect(n: int, count: int) -> Rect2:
	return Rect2(112 + n * 49 if count > 3 else 142 + n * 49, 613, 43, 40)

func _rebuild_buttons() -> void:
	_button_generation += 1
	for button in buttons.values():
		button.disabled = true
		button.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.queue_free()
	buttons.clear()
	var screen: String = model.get("screen", "home")
	var root_enabled: bool = model.get("panel_pending", {}).is_empty() and not model.get("pending", false)
	_button("settings", "", Rect2(366, 23, 48, 48), "settings", root_enabled)
	if screen == "home":
		_button("mascot-tap", "", Rect2(92, 260, 246, 307), "", true, Color("fffcf300"))
		for n in range(3):
			_button("menu:honor-" + str(n), "", Rect2(28 + n * 132, 149, 110, 92), "", true, Color("fffcf300"))
		_button("start", "加入萝卜队", Rect2(51, 637, 328, 66), "", true, Assets.YELLOW, 28)
		var names := ["排行榜", "好友", "话题", "装扮", "我的", "俱乐部"]
		var ids := ["rank", "friends", "topic", "wardrobe", "profile", "club"]
		for n in range(6):
			_button("menu:" + ids[n], names[n], Rect2(34 + (n % 3) * 124, 753 + (n / 3) * 64, 114, 58), ids[n], true, Assets.CREAM, 16)
		_button("menu:bullet", "发弹幕", Rect2(49, 703, 125, 48), "bullet", true, Color("fffcf300"), 16)
		_button("menu:about", "本地预览", Rect2(259, 703, 125, 48), "eye", true, Color("fffcf300"), 16)
	elif screen == "play":
		_button("exit", "", Rect2(16, 23, 48, 48), "back", root_enabled)
		var labels := ["移出", "撤回", "洗牌"]
		var ids := ["move", "undo", "shuffle"]
		for n in range(3):
			var eligibility: Dictionary = model.get("assist", {}).get(ids[n], {})
			_button("assist:" + ids[n], labels[n] + "  " + str(eligibility.get("remaining", 0)), Rect2(28 + n * 134, 805, 106, 75), ids[n], root_enabled and eligibility.get("enabled", false) and not director.is_board_locked(), Assets.CREAM, 19)
	else:
		_button("return-home", "", Rect2(16, 23, 48, 48), "back")
		var data: Dictionary = _social_model()
		var count: int = data.get("rows", []).size()
		_social_page = clampi(_social_page, 0, maxi(0, (count - 1) / 7))
		if count > 7:
			_button("page-prev", "上一页", Rect2(34, 736, 120, 48), "", _social_page > 0, Assets.CREAM, 17)
			_button("page-next", "下一页", Rect2(276, 736, 120, 48), "", (_social_page + 1) * 7 < count, Assets.CREAM, 17)
		var actions: Array = data.get("actions", [])
		for n in range(actions.size()):
			var action: Dictionary = actions[n]
			var columns := 3 if actions.size() > 3 else maxi(1, actions.size())
			var width := 362.0 / columns
			_button(action.id, action.label, Rect2(34 + (n % columns) * width, 794 + (n / columns) * 58, width - 6, 50), "", action.get("enabled", true), Assets.CREAM, 15)

func _social_model() -> Dictionary:
	if not ResourceLoader.exists("res://ui/social_presenter.gd"):
		return {"title": "本地数据", "subtitle": "正在加载", "rows": [], "actions": []}
	return load("res://ui/social_presenter.gd").new().render(model.get("info", {}), model.get("page", "profile"))

func _button(id: String, text: String, rect: Rect2, icon_key := "", enabled := true, fill := Assets.CREAM, font_size := 20) -> void:
	var button := Button.new()
	button.name = id.validate_node_name()
	button.position = rect.position
	button.size = rect.size
	button.text = text
	button.disabled = not enabled
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_override("font", assets.font())
	button.add_theme_font_size_override("font_size", font_size)
	for state in ["normal", "hover", "pressed", "disabled"]:
		var box := StyleBoxFlat.new()
		box.bg_color = fill if state != "disabled" else Color("e1e8d4")
		box.border_color = Assets.BORDER
		box.set_border_width_all(1 if fill.a > 0 else 0)
		box.set_corner_radius_all(14)
		# StyleBoxFlat otherwise derives a 0–1 px content inset from its border.
		# Native Button draws a left-aligned icon at that inset, on the rounded edge.
		box.content_margin_left = 12
		box.content_margin_right = 12
		button.add_theme_stylebox_override(state, box)
	button.add_theme_color_override("font_color", Assets.INK)
	button.add_theme_color_override("font_disabled_color", Assets.MUTED)
	if not icon_key.is_empty():
		button.icon = assets.icon(icon_key)
		button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER if text.is_empty() else HORIZONTAL_ALIGNMENT_LEFT
		button.expand_icon = true
		button.add_theme_constant_override("icon_max_width", 24)
		button.add_theme_constant_override("h_separation", 5)
		button.add_theme_color_override("icon_normal_color", Assets.INK)
		button.add_theme_color_override("icon_hover_color", Assets.INK)
		button.add_theme_color_override("icon_pressed_color", Assets.GREEN)
		button.add_theme_color_override("icon_disabled_color", Assets.MUTED)
	button.pressed.connect(_button_action.bind(id, _button_generation))
	button_layer.add_child(button)
	buttons[id] = button

func _button_action(id: String, generation: int) -> void:
	if generation != _button_generation or not buttons.has(id) or buttons[id].disabled or not buttons[id].visible or not model.get("modal", {}).is_empty() or not model.get("panel_pending", {}).is_empty():
		return
	_action(id)

func _draw() -> void:
	if model.is_empty():
		return
	var screen: String = model.get("screen", "home")
	background(assets.texture("background.home" if screen == "home" else "background.board"))
	if screen == "home":
		label("卜了个卜", Vector2(215, 64), 43)
		label("每天三张，快乐一场", Vector2(215, 111), 17, Assets.GREEN)
		var honors := ["首通萝卜", "萝卜王", "手速达人"]
		for n in range(3):
			var x := 28.0 + n * 132.0
			panel(Rect2(x, 149, 110, 96))
			label(honors[n], Vector2(x + 55, 219), 17)
			var key: String = ["first", "king", "fast"][n]
			var holder: Variant = model.get("info", {}).get("honors", {}).get(key)
			label(holder.name if holder is Dictionary else "暂无记录", Vector2(x + 55, 238), 10, Assets.GREEN)
		panel(Rect2(87, 575, 256, 42))
		label(str(model.get("info", {}).get("profile", {}).get("region", "广东")) + "萝卜队", Vector2(215, 596), 22)
	elif screen == "play":
		_draw_board_chrome()
	else:
		var data: Dictionary = _social_model()
		label(data.get("title", "本地数据"), Vector2(215, 103), 30)
		label(data.get("subtitle", ""), Vector2(215, 145), 14, Assets.GREEN)
		var rows: Array = data.get("rows", [])
		for n in range(_social_page * 7, mini(rows.size(), (_social_page + 1) * 7)):
			var row: Dictionary = rows[n]
			var y := 179.0 + (n % 7) * 77
			panel(Rect2(28, y, 374, 67))
			label(row.get("text", ""), Vector2(215, y + 22), 18)
			label(row.get("detail", ""), Vector2(215, y + 48), 13, Assets.GREEN)
	label("技术预览 · 本地数据", Vector2(215, 909), 13, Assets.MUTED)
	if not model.get("notice", "").is_empty():
		var messages := {"WRITE_FAILED": "保存未完成，请重试", "STORAGE_WRITE_FAILED": "保存未完成，请重试", "UI_LOCKED": "请等待当前操作完成", "GRANT_CANCELLED": "已取消本次模拟", "GRANT_FAILED": "本次模拟未完成"}
		var notice: String = messages.get(model.notice, model.notice)
		if notice == notice.to_upper() and notice.contains("_"):
			notice = "操作未完成，请重试"
		label(notice, Vector2(215, 889), 13, Assets.GREEN)
	if model.get("prefs", {}).get("bullets", true):
		var bullets: Array = model.get("info", {}).get("bullets", [])
		var banner := _bullet_rect()
		if not bullets.is_empty() and banner.has_area():
			panel(banner, Color("fffcf3d9"))
			label(bullets[-1].text.replace("羊队", "萝卜队"), banner.get_center(), 13)

func _bullet_rect() -> Rect2:
	# Each screen reserves different chrome. A shared home Y covered social
	# subtitles and the live board's progress bar after the first sent bullet.
	match model.get("screen", "home"):
		"play":
			return Rect2(38, 882, 354, 20) if model.get("notice", "").is_empty() else Rect2()
		"social":
			return Rect2(38, 154, 354, 20)
	return Rect2(38, 124, 354, 24)

func _draw_board_chrome() -> void:
	var state: Dictionary = model.get("state", {})
	if state.is_empty():
		return
	var board: Dictionary = state.board
	var mode: String = model.get("ticket", {}).get("mode", "daily")
	label({"tutorial": "新手教学", "daily": "每日挑战", "topic": "话题挑战"}.get(mode, "挑战"), Vector2(215, 43), 27)
	label(model.get("ticket", {}).get("day", ""), Vector2(215, 81), 16, Assets.GREEN)
	var ms: int = router.clock.elapsed_ms()
	label("%d:%02d" % [ms / 60000, (ms / 1000) % 60], Vector2(215, 108), 16, Assets.GREEN)
	panel(Rect2(44, 138, 342, 12), Color("d5dfc4"), 6)
	if board.cleared > 0:
		panel(Rect2(44, 138, 342.0 * board.cleared / board.deal.cells.size(), 12), Assets.YELLOW, 6)
	label("%d / %d" % [board.cleared, board.deal.cells.size()], Vector2(215, 165), 13, Assets.GREEN)
	var counts: Dictionary = {}
	for c in board.deal.cells:
		if c.zone == "side" and not board.taken[board.byId[c.id]]:
			counts[c.stackId] = counts.get(c.stackId, 0) + 1
	var names: Array = _side_names
	for n in range(names.size()):
		label(str(counts.get(names[n], 0)) + " 张", Vector2(54 if n == 0 else 377, 538), 12, Assets.GREEN)
	label("预留区", Vector2(66, 630), 16, Assets.GREEN)
	for n in range(maxi(3, board.buffer.size())):
		panel(_buffer_rect(n, board.buffer.size()), Color("e1e8d4"), 8)
	panel(Rect2(17, 662, 396, 88))
	for n in range(7):
		panel(_rack_rect(n), Color("e1e8d4"), 8)
	label("相同三张即可消除", Vector2(215, 773), 17, Assets.GREEN)
	if frame.get("particles_active", false):
		for n in range(18):
			var t: float = frame.particles
			var angle := n * TAU / 18
			draw_circle(Vector2(215, 704) + Vector2(cos(angle) * t * 95, sin(angle) * t * 45), 2.0 * (1.0 - t), Color(Assets.YELLOW, 1.0 - t))

func panel(rect: Rect2, fill := Assets.CREAM, radius := 14) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = Assets.BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	draw_style_box(style, rect)

func label(text: String, center: Vector2, font_size := 20, color := Assets.INK) -> void:
	var font: Font = assets.font()
	var measured := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	draw_string(font, center + Vector2(-measured.x / 2, font.get_ascent(font_size) - font.get_height(font_size) / 2), text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)

func contain(texture: Texture2D, rect: Rect2) -> void:
	if texture == null:
		return
	var factor := minf(rect.size.x / texture.get_width(), rect.size.y / texture.get_height())
	var dimensions := texture.get_size() * factor
	draw_texture_rect(texture, Rect2(rect.get_center() - dimensions / 2, dimensions), false)

func background(texture: Texture2D) -> void:
	draw_rect(Rect2(Vector2.ZERO, SIZE), Assets.GRASS)
	if texture == null:
		return
	var factor := maxf(SIZE.x / texture.get_width(), SIZE.y / texture.get_height())
	var dimensions := texture.get_size() * factor
	draw_texture_rect(texture, Rect2((SIZE - dimensions) / 2, dimensions), false)
