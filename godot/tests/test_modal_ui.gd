extends RefCounted

class Actions extends RefCounted:
	var ids: Array[String] = []
	func record(id: String) -> void:
		ids.append(id)

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://ui/modal_presenter.gd") or not FileAccess.file_exists("res://scenes/modal.tscn"):
		a.truth(false, "native modal script and scene exist")
		return true
	var scene = load("res://scenes/modal.tscn")
	if not scene is PackedScene:
		a.truth(false, "native modal scene loads")
		return true
	var modal = scene.instantiate()
	var tree := Engine.get_main_loop() as SceneTree
	var host := Control.new()
	host.size = Vector2(430, 932)
	tree.root.add_child(host)
	var board_button := Button.new()
	board_button.size = Vector2(430, 932)
	var board_actions := Actions.new()
	board_button.pressed.connect(board_actions.record.bind("board-take"))
	host.add_child(board_button)
	host.add_child(modal)
	var actions := Actions.new()
	modal.action_requested.connect(actions.record)
	a.truth(modal is Control, "native modal is a Control")
	a.equal(modal.visible, false, "new modal starts hidden")
	var prefs := {"music": true, "sound": false, "vibration": true, "bullets": false, "reducedMotion": true}
	var model := {"prefs": prefs, "actions": ["setting-music", "setting-sound", "setting-vibration", "setting-bullets", "setting-reducedMotion", {"id": "setting-extra", "label": "预留设置", "enabled": true}, "close"]}
	var before := model.duplicate(true)
	modal.show_modal("SETTINGS", model)
	a.equal(model, before, "view does not mutate router model or prefs")
	a.truth(modal.visible and modal.is_visible_in_tree(), "settings modal is visible in real scene tree")
	a.equal(modal.get_rect(), Rect2(0, 0, 430, 932), "modal covers fixed logical screen")
	a.equal(modal.overlay.get_rect(), Rect2(0, 0, 430, 932), "native overlay covers underlying card layer")
	a.equal(modal.overlay.mouse_filter, Control.MOUSE_FILTER_STOP, "overlay stops underlying GUI input")
	a.equal(modal.mouse_filter, Control.MOUSE_FILTER_STOP, "modal root stops event propagation")
	a.truth(modal.z_index > 100, "modal draws above normal board controls")
	a.equal(modal.title_label.text, "设置", "settings title is Chinese")
	a.truth(modal.title_label.get_theme_font("font").has_char("设".unicode_at(0)), "native title font has Chinese glyphs")
	a.equal(modal.mascot.texture.resource_path, "res://assets/character/reference-cutout-v1.png", "modal reuses existing radish sample")
	a.equal(modal.mascot.get_rect(), Rect2(152, 62, 76, 102), "radish native texture minimum cannot expand beyond modal sample box")
	a.equal(modal.action_buttons.size(), 7, "six settings actions and close are all available")
	var screen := Rect2(0, 0, 430, 932)
	for id in modal.action_buttons:
		var button: Button = modal.action_buttons[id]
		a.truth(button.is_visible_in_tree(), id + " is a visible native button")
		a.truth(button.size.x >= 48 and button.size.y >= 48, id + " touch target is at least 48 logical pixels")
		a.truth(screen.encloses(button.get_global_rect()), id + " fits on screen")
		a.truth(modal.panel.get_global_rect().encloses(button.get_global_rect()), id + " fits in modal panel")
	a.equal(modal.action_buttons["setting-music"].text, "音乐：开", "setting label shows actual enabled preference")
	a.equal(modal.action_buttons["setting-sound"].text, "音效：关", "setting label shows actual disabled preference")
	a.equal(modal.action_buttons["setting-reducedMotion"].text, "减少动效：开", "reduced motion label uses actual preference")
	a.equal(modal.action_buttons["close"].icon.resource_path, "res://assets/ui-icons/x-bold.svg", "close uses selected Phosphor icon")
	modal.action_buttons["close"].pressed.emit()
	a.equal(actions.ids, ["close"], "native close button emits Router action ID")
	a.equal(modal.visible, true, "view leaves authorized close decision to Router")
	var old_callback: Callable = modal.action_buttons["setting-music"].pressed.get_connections()[0].callable
	modal.show_modal("PROVIDER", {"pending": {"assist": "revive", "channel": "video", "token": "private-token"}, "simulation": true, "actions": ["dev-complete", "dev-cancel", "dev-fail"]})
	a.truth(modal.message_label.text.contains("本地模拟"), "reward provider honestly labels local simulation")
	a.truth(modal.message_label.text.contains("真实广告"), "reward provider states it is not a real ad")
	a.equal(modal.message_label.text.contains("private-token"), false, "reward token is not dumped into product UI")
	a.equal(modal.action_buttons["dev-complete"].text, "完成模拟", "simulation has clear completion button")
	a.equal(modal.action_buttons["dev-cancel"].text, "提前关闭", "simulation has clear cancellation button")
	old_callback.call()
	a.equal(actions.ids, ["close"], "stale previous-panel button callback is rejected")
	modal.show_modal("SETTLEMENT_ERROR", {"saved": false, "error": "WRITE_FAILED", "actions": [{"id": "retry-settlement", "label": "再试一次", "enabled": false}]})
	a.truth(modal.message_label.text.contains("尚未保存"), "failed settlement never claims saved")
	a.equal(modal.message_label.text.contains("WRITE_FAILED"), false, "technical error code is not exposed as product message")
	a.truth(modal.action_buttons["retry-settlement"].disabled, "button respects current Router eligibility")
	modal.action_buttons["retry-settlement"].pressed.emit()
	a.equal(actions.ids, ["close"], "disabled action cannot emit even from stale direct callback")
	modal.show_modal("WIN", {"saved": true, "elapsedMs": 65000, "actions": ["return-home"]})
	a.truth(modal.message_label.text.contains("已保存"), "confirmed settlement can state saved")
	modal.show_modal("LOAD_ERROR", {"message": "较长的中文说明。".repeat(30), "error": "READ_FAILED", "actions": ["retry-load"]})
	a.equal(modal.message_label.autowrap_mode, TextServer.AUTOWRAP_WORD_SMART, "long message uses native Chinese autowrap")
	a.equal(modal.message_label.text, "较长的中文说明。".repeat(30), "provided human message is preserved")
	modal.action_buttons["retry-load"].pressed.emit()
	a.equal(actions.ids, ["close", "retry-load"], "visible retry button emits real Router action ID")
	var hidden_callback: Callable = modal.action_buttons["retry-load"].pressed.get_connections()[0].callable
	modal.close_modal()
	a.equal(modal.visible, false, "close_modal hides blocking layer")
	a.equal(modal.action_buttons.size(), 0, "close_modal destroys old interactive controls")
	hidden_callback.call()
	a.equal(actions.ids, ["close", "retry-load"], "hidden modal cannot emit old action callbacks")
	_click_native(tree.root, Vector2(10, 20))
	a.equal(board_actions.ids, ["board-take"], "native GUI harness reaches real board button while modal is closed")
	modal.show_modal("SETTINGS", {"actions": ["close"]})
	_click_native(tree.root, Vector2(10, 20))
	a.equal(board_actions.ids, ["board-take"], "visible native blocker prevents actual mouse click reaching board")
	modal.action_requested.connect(func(id: String):
		if id == "close": modal.close_modal()
	)
	_click_native(tree.root, modal.action_buttons["close"].get_global_rect().get_center())
	a.equal(actions.ids, ["close", "retry-load", "close"], "native mouse press and release activates modal close through blocking overlay")
	a.equal(modal.visible, false, "synchronous Router callback can close modal while native button emits")
	a.equal(modal.action_buttons.size(), 0, "synchronous Router close clears all live actions without freeing locked emitter")
	host.free()
	return true

func _click_native(viewport: Viewport, point: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	viewport.push_input(motion, true)
	var event := InputEventMouseButton.new()
	event.position = point
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	viewport.push_input(event, true)
	event = InputEventMouseButton.new()
	event.position = point
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = false
	viewport.push_input(event, true)
