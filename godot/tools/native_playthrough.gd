extends Node
## Native GUI automation: reads presentation state, writes only mouse events.
## No reducer/router actions, save injection, or forced terminal state.

var view: Node
var failures: Array[String] = []
var capture_dir := ""
var _events: FileAccess
var _frame_index: FileAccess
var _recording := false
var _capturing := false
var _frame_no := 0
var _still_no := 0
var _steps := 0
var _started := 0
var _short := false
var _size_only := false
var _milestones: Array = []
var _view_factory: Callable
var _resize_enabled := true

func run(native_view: Node, options: Dictionary = {}) -> void:
	_view_factory = options.get("view_factory", Callable())
	_resize_enabled = options.get("resize", true)
	capture_dir = options.get("capture_dir", capture_dir)
	view = native_view
	await get_tree().process_frame
	var tree := get_tree()
	get_parent().remove_child(self)
	tree.root.add_child(self)
	_started = Time.get_ticks_msec()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="): capture_dir = arg.trim_prefix("--capture-dir=")
	_short = options.get("short", "--short-playthrough" in OS.get_cmdline_user_args())
	_size_only = "--size-only" in OS.get_cmdline_user_args()
	if capture_dir.is_empty(): capture_dir = ProjectSettings.globalize_path("res://artifacts/runtime/native")
	DirAccess.make_dir_recursive_absolute(capture_dir.path_join("frames"))
	_events = FileAccess.open(capture_dir.path_join("events.jsonl"), FileAccess.WRITE)
	_frame_index = FileAccess.open(capture_dir.path_join("frames.jsonl"), FileAccess.WRITE)
	_recording = not _size_only
	if _recording: _record_video.call_deferred()
	var completed := false
	if _size_only: completed = await _size_scenario()
	else: completed = await _scenario()
	if not completed and failures.is_empty(): _check(false, "scenario did not finish")
	_recording = false
	while _capturing: await tree.process_frame
	if completed and _resize_enabled: completed = await _resize_captures()
	await _capture("final" if completed else "failure")
	var result := {
		"ok": completed and failures.is_empty(), "failures": failures,
		"engine": Engine.get_version_info(), "viewport": [430, 932], "fps": 10,
		"input": "Viewport.push_input native mouse motion/press/release only",
		"capture": "Unmodified native Viewport texture PNG after frame_post_draw",
		"daily_win": "Not part of size-only supplemental validation" if _size_only else ("Skipped in short native run; genuine tutorial win verified" if _short else "Developer receipt guided real GUI clicks; not manual player completion"),
		"short": _short, "size_only": _size_only, "resize_checked": _resize_enabled, "frames": _frame_no, "steps": _steps,
		"duration_ms": Time.get_ticks_msec() - _started, "milestones": _milestones,
		"user_data_dir": OS.get_user_data_dir()
	}
	var report := FileAccess.open(capture_dir.path_join("report.json"), FileAccess.WRITE)
	report.store_string(JSON.stringify(result, "\t"))
	report.close()
	_events.flush()
	_events.close()
	_frame_index.close()
	print("NATIVE_QA_RESULT ", JSON.stringify(result))
	await pause(.15)
	# Let native controls, audio and deferred presentation callbacks retire
	# before ending the process from this asynchronous QA driver.
	view.queue_free()
	view = null
	_events = null
	_frame_index = null
	await tree.process_frame
	await tree.process_frame
	queue_free()
	tree.quit.call_deferred(0 if result.ok else 1)

func _size_scenario() -> bool:
	await pause(.25)
	await _capture("home")
	await pause(3.3)
	if view.buttons.has("mascot-tap"):
		if not (await click_button("mascot-tap")): return false
		await pause(.9)
	if not (await click_button("start")): return false
	if view.model.ticket.mode == "tutorial":
		var tutorial: Array = view.model.state.initialDeal.cells.duplicate(true)
		for cell in tutorial:
			if not (await click_tile(cell.id)): return false
		if not (await click_button("next-daily")): return false
	await _capture("daily-board")
	return _check(view.model.ticket.mode == "daily", "supplemental size validation uses actual daily GUI board")

func _scenario() -> bool:
	await pause(.35)
	if not _check(view.model.screen == "home" and not view.model.info.profile.tutorialDone, "fresh profile home without tutorial progress"): return false
	await _capture("home")
	await pause(3.3)
	if view.buttons.has("mascot-tap"):
		if not (await click_button("mascot-tap")): return false
		await pause(.9)
	if not (await click_button("start")): return false
	if not _check(view.model.ticket.mode == "tutorial" and view.model.state.initialDeal.cells.size() == 12, "actual twelve tile tutorial ticket"): return false
	await _capture("tutorial")
	var tutorial: Array = view.model.state.initialDeal.cells.duplicate(true)
	for cell in tutorial:
		if not (await click_tile(cell.id)): return false
	if not _check(view.model.state.board.status == "WON" and view.model.modal.kind == "TUTORIAL_WIN" and view.model.info.profile.tutorialDone, "tutorial genuinely won and settled"): return false
	await _capture("tutorial-win")
	if not (await click_button("next-daily")): return false
	if not _check(view.model.ticket.mode == "daily" and view.model.state.initialDeal.cells.size() in [270, 540, 720], "actual daily fixed deal"): return false
	await _capture("daily-board")
	if not (await click_button("settings")): return false
	var frozen: int = view.router.clock.elapsed_ms()
	await pause(.4)
	if not _check(view.router.clock.elapsed_ms() == frozen, "live clock pauses for settings modal"): return false
	await _capture("settings-clock-paused")
	if not (await click_button("close")): return false
	await pause(.1)
	if not _check(view.router.clock.elapsed_ms() > frozen, "live clock resumes after settings close"): return false
	var side := _choose("side")
	if not _check(not side.is_empty(), "visible legal side-stack tile exists"): return false
	if not (await click_tile(side)): return false
	await _capture("side-taken")
	var central := _choose("board")
	if not _check(not central.is_empty(), "visible legal central tile exists"): return false
	if not (await click_tile(central)): return false
	if not (await _assist("undo")): return false
	if not _check(not view.model.state.board.taken[view.model.state.board.byId[central]] and view.model.state.used.undo == 1, "real undo restores central card once"): return false
	await _capture("undo-applied")
	while view.model.state.board.rack.size() < 3:
		if not (await click_tile(_choose("any"))): return false
	if not (await _assist("move")): return false
	if not _check(view.model.state.board.buffer.size() == 3 and view.model.state.used.move == 1, "real move creates three buffered cards"): return false
	await _capture("move-applied")
	var buffered: String = view.model.state.board.buffer[-1]
	if not (await click_tile(buffered)): return false
	if not _check(view.model.state.board.buffer.size() == 2 and buffered not in view.model.state.board.buffer, "arbitrary buffered card returns through GUI"): return false
	await _capture("buffer-return")
	if not (await _assist("shuffle")): return false
	if not _check(view.model.state.used.shuffle == 1, "real shuffle used once"): return false
	await _capture("shuffle-applied")
	if not (await _reach_loss()): return false
	if not _check(view.model.modal.kind == "REVIVE", "actual first seven-slot loss offers revive"): return false
	await _capture("lost-revive-offer")
	if not (await click_button("revive")): return false
	if not (await _reward()): return false
	if not _check(view.model.state.board.status == "PLAYING" and view.model.state.used.revive == 1, "real simulated revive resumes gameplay"): return false
	await _capture("revived")
	if not (await _reach_loss()): return false
	if not _check(view.model.modal.kind == "LOSE" and view.model.modal.model.saved and not view.model.pending, "second genuine loss settled and saved"): return false
	await _capture("lost-settled")
	if not (await click_button("return-home")): return false
	if not (await click_button("menu:profile")): return false
	await _capture("profile-after-loss")
	if not (await click_button("return-home")): return false
	if not (await click_button("menu:wardrobe")): return false
	if not _check(view.buttons.has("equip:cap") and view.buttons["equip:cap"].disabled, "unearned cap remains visibly locked"): return false
	await _capture("wardrobe-locked")
	if not (await click_button("return-home")): return false
	if not (await click_button("menu:bullet")): return false
	var bullet_id := ""
	for id in view.buttons:
		if str(id).begins_with("send-bullet:"): bullet_id = id; break
	var before_bullets: int = view.model.info.bullets.size()
	if not (await click_button(bullet_id)): return false
	if not _check(view.model.info.bullets.size() == before_bullets + 1, "native preset bullet button creates persisted entry"): return false
	await _capture("bullets")
	if not (await click_button("return-home")): return false
	if not (await click_button("settings")): return false
	for id in ["setting-music", "setting-sound", "setting-reducedMotion"]:
		if not (await click_button(id)): return false
	if not _check(not view.model.prefs.music and not view.model.prefs.sound and view.model.prefs.reducedMotion, "actual preferences changed and persisted"): return false
	await _capture("settings-reduced-motion")
	if not (await click_button("close")): return false
	if not _short:
		if not (await _receipt_win()): return false
	if not (await click_button("menu:profile")): return false
	await _capture("profile")
	if not (await click_button("return-home")): return false
	if not (await _reload_and_count()): return false
	return true

func _assist(name: String) -> bool:
	if not (await click_button("assist:" + name)): return false
	return await _reward()

func _reward() -> bool:
	if not _check(view.model.modal.kind == "OFFER", "actual reward offer visible"): return false
	if not (await click_button("grant")): return false
	if not _check(view.model.modal.kind == "PROVIDER" and view.model.state.pending.phase == "WAITING", "launch is local simulation and grants nothing"): return false
	if not (await click_button("dev-complete")): return false
	return _check(view.model.state.pending == null, "earned local simulation actually committed through controls")

func _reach_loss() -> bool:
	for unused in range(30):
		if view.model.state.board.status == "LOST": return true
		var selected := _choose("any")
		if not _check(not selected.is_empty(), "nonmatching exposed tile available before seven-slot loss"): return false
		if not (await click_tile(selected)): return false
	return _check(false, "loss not reached by genuine nonmatching picks")

func _receipt_win() -> bool:
	if not (await click_button("start")): return false
	var deal_id: String = view.model.state.initialDeal.dealId
	var fixture: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/board_cases.json"))
	var receipt: Dictionary = {}
	for candidate in fixture.cases:
		if str(candidate.name).begins_with("developer-acceptance-receipt-") and candidate.deal.dealId == deal_id:
			receipt = candidate
			break
	if not _check(not receipt.is_empty() and view.model.state.revision == 0, "matching developer receipt guides fresh actual daily board"): return false
	_log("receipt-guide", {"case": receipt.name, "notice": "Automated legal GUI clicks guided by developer receipt; not a manual daily win"})
	for step in receipt.steps:
		if not (await click_tile(step.action.id)): return false
	if not _check(view.model.state.board.status == "WON" and view.model.modal.kind == "WIN" and view.model.modal.model.saved, "developer receipt GUI clicks reached actual saved daily win"): return false
	await _capture("win-developer-receipt-gui")
	if not (await click_button("return-home")): return false
	if not (await click_button("menu:wardrobe")): return false
	if not (await click_button("equip:cap")): return false
	if not _check(view.model.info.profile.skin == "cap", "daily win unlocks and native wardrobe button equips cap"): return false
	await _capture("wardrobe-cap-equipped")
	return await click_button("return-home")

func _reload_and_count() -> bool:
	var expected_id: String = view.model.userId
	var expected_prefs: Dictionary = view.model.prefs.duplicate()
	view.queue_free()
	await get_tree().process_frame
	view = _view_factory.call() if _view_factory.is_valid() else load("res://scenes/main.tscn").instantiate()
	get_tree().root.add_child(view)
	await pause(.25)
	if not _check(view.model.userId == expected_id and view.model.prefs == expected_prefs and view.model.info.profile.tutorialDone, "complete UI recreation reloads original identity prefs tutorialDone from disk"): return false
	await _capture("disk-reloaded-home")
	var baseline := _node_count(view)
	var counts: Array[int] = []
	for unused in range(3):
		if not (await click_button("start")): return false
		if not _check(view.model.ticket.mode == "daily", "disk reload starts daily directly"): return false
		if not (await click_button("exit")): return false
		if not (await click_button("confirm-exit")): return false
		await pause(.1)
		counts.append(_node_count(view))
	_log("node-counts", {"baseline": baseline, "after_rounds": counts})
	return _check(counts.all(func(count): return count == baseline), "repeated native round creation and exit do not grow node count")

func _resize_captures() -> bool:
	if view.model.screen == "home" and not (await click_button("start")): return false
	var before: String = JSON.stringify(view.model.state).sha256_text()
	for dimensions in [Vector2i(390, 720), Vector2i(860, 1864)]:
		get_window().size = dimensions
		await pause(.35)
		if not _check(get_window().size == dimensions, "native Window client size matches requested %dx%d" % [dimensions.x, dimensions.y]): return false
		if not _check(JSON.stringify(view.model.state).sha256_text() == before, "native resize retains exact authoritative board state"): return false
		_log("resize", _window_metrics())
		# Canvas stretch can render at a different size than the OS client.
		# Preserve the native texture without fabricating the letterbox bars.
		await _capture("board-window-%dx%d" % [dimensions.x, dimensions.y], Vector2i.ZERO)
	get_window().size = Vector2i(430, 932)
	await pause(.2)
	if not (await click_button("exit")): return false
	return await click_button("confirm-exit")

func click_button(id: String) -> bool:
	if not (await idle()): return false
	var collection: Dictionary = view.modal_view.action_buttons if not view.model.get("modal", {}).is_empty() else view.buttons
	if not _check(collection.has(id), "visible native button " + id): return false
	var button: Button = collection[id]
	if not _check(button.is_visible_in_tree() and not button.disabled, "actionable native button " + id): return false
	await _mouse_click(button.get_global_rect().get_center())
	if not (await idle()): return false
	_log("button:" + id)
	return true

func click_tile(id: String) -> bool:
	if not (await idle()): return false
	if not _check(view.model.get("modal", {}).is_empty(), "board is unobstructed for tile " + id): return false
	var point := _tile_point(id)
	if not _check(point.x >= 0, "real enabled UI hit target " + id): return false
	var revision: int = view.model.state.revision
	await _mouse_click(point)
	if not (await idle()): return false
	if not _check(view.model.state.revision == revision + 1, "native release commits exactly one take " + id): return false
	_log("tile:" + id)
	return true

func _mouse_click(point: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	get_viewport().push_input(motion, true)
	var down := InputEventMouseButton.new()
	down.position = point
	down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true
	get_viewport().push_input(down, true)
	await get_tree().process_frame
	if not view.model.get("prefs", {}).get("reducedMotion", false): await pause(.045)
	var up := InputEventMouseButton.new()
	up.position = point
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	get_viewport().push_input(up, true)
	await get_tree().process_frame

func idle() -> bool:
	var deadline := Time.get_ticks_msec() + 10000
	while view.director.is_board_locked() or not view.model.get("panel_pending", {}).is_empty():
		if Time.get_ticks_msec() > deadline: return _check(false, "native presentation did not finish within ten seconds")
		await get_tree().process_frame
	return true

func pause(seconds: float) -> void:
	await get_tree().create_timer(seconds).timeout

func _tile_point(id: String) -> Vector2:
	for hit in view.hit_tiles:
		if hit.id != id or not hit.enabled: continue
		var rect: Rect2 = hit.rect
		for fx in [.5, .2, .8, .05, .95]:
			for fy in [.5, .2, .8, .05, .95]:
				var point := rect.position + rect.size * Vector2(fx, fy)
				if view.tile_at(point) == id: return point
	return Vector2(-1, -1)

func _choose(zone: String) -> String:
	var board: Dictionary = view.model.state.board
	var counts: Dictionary = {}
	for id in board.rack:
		var kind: String = board.deal.cells[board.byId[id]].type
		counts[kind] = counts.get(kind, 0) + 1
	var choice := ""
	var score := 3
	for hit in view.hit_tiles:
		if not hit.enabled: continue
		var index: int = board.byId[hit.id]
		var cell: Dictionary = board.deal.cells[index]
		if board.taken[index] or (zone != "any" and cell.zone != zone): continue
		var existing: int = counts.get(cell.type, 0)
		if existing < score and _tile_point(hit.id).x >= 0:
			choice = hit.id
			score = existing
	return choice if score < 2 else ""

func _check(value: bool, label: String) -> bool:
	if not value:
		failures.append(label)
		print("NATIVE_QA_FAIL ", label)
	return value

func _log(action: String, extra: Dictionary = {}) -> void:
	if _events == null: return
	_steps += 1
	var state: Dictionary = view.model.get("state", {})
	var summary: Dictionary = {}
	if not state.is_empty():
		summary = {"roundId": state.roundId, "revision": state.revision, "status": state.board.status, "rack": state.board.rack, "buffer": state.board.buffer, "cleared": state.board.cleared, "used": state.used, "pending": state.pending, "dealId": state.initialDeal.dealId}
	var row := {"step": _steps, "at_ms": Time.get_ticks_msec() - _started, "action": action, "screen": view.model.get("screen", ""), "modal": view.model.get("modal", {}).get("kind", ""), "state": summary, "state_sha256": JSON.stringify(state).sha256_text(), "elapsedMs": view.router.clock.elapsed_ms(), "prefs": view.model.get("prefs", {}), "extra": extra}
	_events.store_line(JSON.stringify(row))
	_events.flush()
	if not action.begins_with("tile:") or _steps % 30 == 0: print("NATIVE_QA_STEP ", _steps, " ", action, " ", summary.get("status", ""))

func _capture(label: String, dimensions: Vector2i = Vector2i(430, 932)) -> void:
	if capture_dir.is_empty(): return
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	_still_no += 1
	var basename := "%02d-%s" % [_still_no, label]
	var png := capture_dir.path_join(basename + ".png")
	if dimensions.x > 0 and not _check(image.get_width() == dimensions.x and image.get_height() == dimensions.y, "native viewport capture dimensions %dx%d" % [dimensions.x, dimensions.y]): return
	_check(image.save_png(png) == OK, "native screenshot saved " + label)
	var state_json := JSON.stringify(view.model, "\t")
	var state_file := FileAccess.open(capture_dir.path_join(basename + ".state.json"), FileAccess.WRITE)
	state_file.store_string(state_json)
	state_file.close()
	_milestones.append({"label": label, "pixels": [image.get_width(), image.get_height()], "window": _window_metrics(), "png": basename + ".png", "png_sha256": FileAccess.get_sha256(png), "snapshot_sha256": state_json.sha256_text()})
	_log("capture:" + label)

func _window_metrics() -> Dictionary:
	var window := get_window()
	var texture_size := get_viewport().get_texture().get_size()
	var visible_size := get_viewport().get_visible_rect().size
	var stretch: Transform2D = get_viewport().get_stretch_transform()
	return {"client_pixels": [window.size.x, window.size.y], "minimum_client_pixels": [window.min_size.x, window.min_size.y], "viewport_texture_pixels": [texture_size.x, texture_size.y], "viewport_visible_size": [visible_size.x, visible_size.y], "content_scale_size": [window.content_scale_size.x, window.content_scale_size.y], "content_scale_mode": window.content_scale_mode, "content_scale_aspect": window.content_scale_aspect, "stretch_transform": [stretch.x.x, stretch.x.y, stretch.y.x, stretch.y.y, stretch.origin.x, stretch.origin.y], "note": "Native viewport texture pixels differ from OS client pixels under canvas stretch; 860x1864 is a 2x window, not an OS-DPR measurement"}

func _record_video() -> void:
	var next_frame_at := Time.get_ticks_msec() + 100
	while _recording:
		var wait_ms := next_frame_at - Time.get_ticks_msec()
		if wait_ms > 0: await pause(wait_ms / 1000.0)
		if not _recording: break
		_capturing = true
		await RenderingServer.frame_post_draw
		var at_ms := Time.get_ticks_msec() - _started
		var image := get_viewport().get_texture().get_image()
		var frame_path := capture_dir.path_join("frames/frame-%06d.png" % _frame_no)
		image.save_png(frame_path)
		_frame_index.store_line(JSON.stringify({"frame": _frame_no, "at_ms": at_ms, "sha256": FileAccess.get_sha256(frame_path)}))
		_frame_index.flush()
		_frame_no += 1
		next_frame_at += 100
		_capturing = false

func _node_count(node: Node) -> int:
	var count := 1
	for child in node.get_children(): count += _node_count(child)
	return count
