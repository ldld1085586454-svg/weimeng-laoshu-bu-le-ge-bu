extends RefCounted

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://ui/main_view.gd"):
		a.truth(false, "playable native view exists")
		return true
	var scene = load("res://scenes/main.tscn")
	a.truth(scene is PackedScene, "native main scene exists")
	var script = load("res://ui/main_view.gd")
	a.truth(script != null and script.can_instantiate(), "native view script compiles")
	if script == null or not script.can_instantiate():
		return true
	var view = scene.instantiate()
	var store = preload("res://tests/helpers/service_memory_store.gd").new()
	view.router = preload("res://ui/app_router.gd").new()
	view.router.configure(store, null, Callable(), Callable(), "native-ui-tests")
	var tree: SceneTree = Engine.get_main_loop()
	tree.root.add_child(view)
	await tree.process_frame
	a.equal(view.model.screen, "home", "real local bootstrap reaches native home")
	a.truth(view.buttons.has("start"), "join is a native actionable button")
	_click(tree.root, view.buttons.start.get_global_rect().get_center())
	await tree.process_frame
	a.equal(view.model.ticket.mode, "tutorial", "actual join input starts tutorial ticket")
	a.equal(view.tile_views.size(), 12, "tutorial cards are actual native TileViews")
	var revision: int = view.model.state.revision
	var first: Dictionary = view.hit_tiles[0]
	_click(tree.root, first.rect.get_center())
	await tree.process_frame
	a.equal(view.model.state.revision, revision + 1, "actual native card input dispatches exactly one saved pick")
	a.truth(view.director.is_board_locked(), "committed flight locks native input")
	var second: Dictionary = view.hit_tiles[0]
	_click(tree.root, second.rect.get_center())
	a.equal(view.model.state.revision, revision + 1, "second click during flight is rejected without queuing")
	await tree.create_timer(.22).timeout
	a.equal(view.model.state.revision, revision + 1, "rejected click never executes after unlock")
	view.router.open_settings()
	await tree.process_frame
	a.truth(view.modal_view.visible, "settings use actual native modal")
	a.truth(view.modal_view.message_label.text.contains("不支持震动"), "Windows settings explicitly disclose unsupported vibration")
	_click(tree.root, second.rect.get_center())
	a.equal(view.model.state.revision, revision + 1, "modal blocks underlying native cards")
	view.modal_view.action_requested.emit("close")
	await tree.process_frame
	a.truth(not view.modal_view.visible, "modal close remains actionable")
	var press := InputEventMouseButton.new()
	press.position = second.rect.get_center()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	tree.root.push_input(press, true)
	var motion := InputEventMouseMotion.new()
	motion.position = Vector2(429, 929)
	tree.root.push_input(motion, true)
	motion.position = second.rect.get_center()
	tree.root.push_input(motion, true)
	press.pressed = false
	tree.root.push_input(press, true)
	a.equal(view.model.state.revision, revision + 1, "drag out and return to original card still cancels take")
	var touch := InputEventScreenTouch.new()
	touch.position = second.rect.get_center()
	touch.index = 13
	touch.pressed = true
	view._input(touch)
	touch.pressed = false
	touch.canceled = true
	view._input(touch)
	a.equal(view.model.state.revision, revision + 1, "system-canceled touch cannot take its original target")
	view.gate.press(1, second.id, view.model.state.roundId)
	view._resized()
	a.equal(view.gate.release(1, second.id, view.model.state.roundId).ok, false, "native resize cancels unfinished gesture")
	var nodes: int = view.tile_views.size()
	view._refresh()
	view._refresh()
	a.equal(view.tile_views.size(), nodes, "repeated render updates reuse card nodes")
	view.router.return_home()
	a.truth(view.buttons.has("menu:honor-0"), "home honor card exposes real honor page")
	var old_start: Callable = view.buttons.start.pressed.get_connections()[0].callable
	view._refresh()
	old_start.call()
	a.equal(view.model.screen, "home", "callback from previous button generation cannot start a round")
	view._action("menu:bullet")
	var bullet_id := ""
	for id in view.buttons:
		if id.begins_with("send-bullet:"):
			bullet_id = id
			break
	a.truth(not bullet_id.is_empty(), "real bullet preset has native action")
	var old_bullet: Callable = view.buttons[bullet_id].pressed.get_connections()[0].callable
	view.router.return_home()
	view._action("menu:bullet")
	var bullet_count: int = view.model.info.bullets.size()
	old_bullet.call()
	a.equal(view.model.info.bullets.size(), bullet_count, "old bullet callback cannot mutate newly opened page")
	view.router.return_home()
	_click(tree.root, view.buttons.start.get_global_rect().get_center())
	for step in range(12):
		var legal: Array = view.hit_tiles.filter(func(hit): return hit.enabled)
		_click(tree.root, legal[0].rect.get_center())
		if view.model.state.board.status == "PLAYING":
			view.director.advance(1000)
	view.director.set_process(false)
	view.director.advance(450)
	a.equal(view.model.state.board.status, "WON", "native tutorial clicks reach saved win")
	a.truth(view.buttons.settings.disabled and view.buttons.exit.disabled, "terminal transition disables underlying menu buttons")
	_click(tree.root, view.buttons.settings.get_global_rect().get_center())
	a.truth(view.model.modal.is_empty() and not view.modal_view.visible, "settings click cannot display win before 510ms")
	a.equal(view.director.current_frame().get("elapsed_ms", -1), 450.0, "rejected terminal settings click preserves animation")
	view.director.advance(60)
	a.truth(view.modal_view.visible, "native win panel begins at 510ms")
	view.director.advance(80)
	a.equal(view.modal_view.modulate.a, .5, "native win panel fades halfway at 590ms")
	a.truth(view.modal_view.action_buttons["next-daily"].disabled, "preview win action remains disabled")
	view.director.advance(80)
	a.truth(not view.modal_view.action_buttons["next-daily"].disabled, "win action becomes available at 670ms")
	view.queue_free()
	await tree.process_frame
	return true

func _click(viewport: Viewport, point: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	viewport.push_input(motion, true)
	var press := InputEventMouseButton.new()
	press.position = point
	press.global_position = point
	press.button_index = MOUSE_BUTTON_LEFT
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.pressed = true
	viewport.push_input(press, true)
	var release := press.duplicate()
	release.pressed = false
	release.button_mask = 0
	viewport.push_input(release, true)
