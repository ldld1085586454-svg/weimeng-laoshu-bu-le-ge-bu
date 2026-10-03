extends "res://tools/native_playthrough.gd"
## Supplemental native mouse-only audit of every home entry and interrupted flow.

func _scenario() -> bool:
	await pause(.4)
	await _capture("home-icons-fixed")
	for page in ["rank", "friends", "wardrobe", "profile", "club", "bullet", "about", "honor-0", "honor-1", "honor-2"]:
		var button: Button = view.buttons["menu:" + page]
		# Hit the glyph itself, rather than only the center/text of the button.
		var point := button.get_global_rect().position + Vector2(24, button.size.y / 2.0)
		await _mouse_click(point)
		if not _check(view.model.screen == "social" and view.model.page == ("honor" if page.begins_with("honor-") else page), "actual icon click opens " + page): return false
		_log("icon-click:" + page)
		await _capture("home-entry-" + page)
		if view.buttons.has("page-next") and not view.buttons["page-next"].disabled:
			if not (await click_button("page-next")): return false
			await _capture(page + "-page-2")
			if not (await click_button("page-prev")): return false
		if page == "wardrobe":
			var old_skin: String = view.model.info.profile.skin
			await _mouse_click(view.buttons["equip:cap"].get_global_rect().get_center())
			if not _check(view.model.info.profile.skin == old_skin, "locked wardrobe action cannot equip unearned cap"): return false
		if not (await click_button("return-home")): return false
		if not _check(view.model.screen == "home", "back returns from " + page): return false
	if not (await click_button("menu:topic")): return false
	if not _check(view.model.modal.kind == "TOPIC", "topic home icon opens actual topic modal"): return false
	await _capture("topic-entry-modal")
	if not (await click_button("close")): return false
	if not _check(view.model.screen == "home" and view.model.modal.is_empty(), "topic modal close restores home"): return false
	if not (await click_button("settings")): return false
	for key in ["music", "sound", "vibration", "bullets", "reducedMotion"]:
		var before: bool = view.model.prefs[key]
		if not (await click_button("setting-" + key)): return false
		if not _check(view.model.prefs[key] != before, "settings toggle changes " + key): return false
		if not (await click_button("setting-" + key)): return false
		if not _check(view.model.prefs[key] == before, "settings toggle restores " + key): return false
	await _capture("all-settings-checked")
	if not (await click_button("close")): return false
	if not (await super._scenario()): return false
	# Fresh topic board, actual cancel/back paths, and reward failures.
	if not (await click_button("menu:topic")): return false
	if not (await click_button("topic-start")): return false
	if not _check(view.model.ticket.mode == "topic" and view.model.state.board.status == "PLAYING", "topic starts a genuine native board"): return false
	await _capture("topic-board")
	var used_before: int = view.model.state.used.shuffle
	for outcome in ["cancel-offer", "dev-cancel", "dev-fail"]:
		if not (await click_button("assist:shuffle")): return false
		if outcome != "cancel-offer":
			if not (await click_button("grant")): return false
		if not (await click_button(outcome)): return false
		if not _check(view.model.state.pending == null and view.model.state.used.shuffle == used_before and view.model.modal.is_empty(), "reward " + outcome + " neither grants nor consumes tool"): return false
		await _capture("reward-" + outcome)
	if not (await click_button("exit")): return false
	var board_before := JSON.stringify(view.model.state.board)
	if not (await click_button("cancel-exit")): return false
	if not _check(view.model.screen == "play" and view.model.modal.is_empty() and JSON.stringify(view.model.state.board) == board_before, "continue game dismisses exit without changing board"): return false
	if not (await click_tile(_choose("any"))): return false
	if not (await click_button("exit")): return false
	if not (await click_button("confirm-exit")): return false
	if not _check(view.model.screen == "home", "topic confirm exit returns home"): return false
	return true
