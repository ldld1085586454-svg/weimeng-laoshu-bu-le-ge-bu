extends RefCounted

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://tools/native_playthrough.gd"):
		a.truth(false, "native acceptance input helper exists")
		return true
	var tree := Engine.get_main_loop() as SceneTree
	var store_script = load("res://storage/atomic_store.gd")
	var router_script = load("res://ui/app_router.gd")
	var view_script = load("res://ui/main_view.gd")
	var helper_script = load("res://tools/native_playthrough.gd")
	var save_path := "user://acceptance-native-%d/" % Time.get_ticks_usec()
	var store = store_script.new(save_path)
	var router = router_script.new()
	router.configure(store)
	var view = view_script.new()
	view.router = router
	tree.root.add_child(view)
	var helper = helper_script.new()
	tree.root.add_child(helper)
	helper.view = view
	await helper.pause(.05)
	a.equal(view.model.screen, "home", "new real disk profile starts home")
	a.equal(view.model.info.profile.tutorialDone, false, "new real profile has no invented tutorial win")
	a.truth(await helper.click_button("settings"), "native settings button works")
	a.truth(await helper.click_button("setting-reducedMotion"), "native reduced motion toggle saves")
	a.equal(view.model.prefs.reducedMotion, true, "visible preference reflects saved setting")
	a.truth(await helper.click_button("close"), "native modal close works independently of board gate")
	a.truth(await helper.click_button("start"), "native join starts actual tutorial")
	a.equal(view.model.ticket.mode, "tutorial", "new profile gets real tutorial ticket")
	a.equal(view.model.state.initialDeal.cells.size(), 12, "tutorial has actual twelve cards")
	await helper.pause(.08)
	a.truth(await helper.click_button("settings"), "settings pauses live tutorial via native button")
	var frozen: int = view.router.clock.elapsed_ms()
	await helper.pause(.12)
	a.equal(view.router.clock.elapsed_ms(), frozen, "modal time does not enter active gameplay clock")
	a.truth(await helper.click_button("close"), "closing modal resumes actual gameplay")
	await helper.pause(.08)
	a.truth(view.router.clock.elapsed_ms() > frozen, "active clock resumes after native modal close")
	var tutorial: Array = view.model.state.initialDeal.cells.duplicate(true)
	for cell in tutorial:
		a.truth(await helper.click_tile(cell.id), "native tutorial click " + cell.id)
	a.equal(view.model.state.board.status, "WON", "native tutorial inputs reach genuine reducer win")
	a.equal(view.model.modal.kind, "TUTORIAL_WIN", "native tutorial shows actual settled terminal modal")
	a.equal(view.model.info.profile.tutorialDone, true, "real service persists tutorial completion")
	a.equal(view.model.pending, false, "actual settlement cleanup clears pending")
	var identity: String = view.model.userId
	var prefs: Dictionary = view.model.prefs.duplicate()
	a.truth(await helper.click_button("next-daily"), "tutorial modal native button enters actual daily")
	a.equal(view.model.ticket.mode, "daily", "actual daily starts after tutorial")
	a.truth(view.model.state.initialDeal.cells.size() in [270, 540, 720], "daily uses real fixed deal")
	a.truth(await helper.click_button("exit"), "native exit confirmation")
	a.truth(await helper.click_button("confirm-exit"), "native confirmed exit clears active round")
	a.equal(view.model.screen, "home", "native exit returns home")
	view.queue_free()
	await helper.pause(.05)
	var reloaded_router = router_script.new()
	reloaded_router.configure(store_script.new(save_path))
	var reloaded_view = view_script.new()
	reloaded_view.router = reloaded_router
	tree.root.add_child(reloaded_view)
	helper.view = reloaded_view
	await helper.pause(.05)
	a.equal(reloaded_view.model.userId, identity, "new view and router reload original identity from disk")
	a.equal(reloaded_view.model.prefs, prefs, "new view and router reload exact saved preferences from disk")
	a.equal(reloaded_view.model.info.profile.tutorialDone, true, "tutorial completion survives complete UI/controller recreation")
	a.truth(await helper.click_button("start"), "reloaded native join works")
	a.equal(reloaded_view.model.ticket.mode, "daily", "disk-reloaded tutorial completion skips tutorial")
	a.equal(helper.failures, [], "native helper observed no failed GUI intents")
	reloaded_view.queue_free()
	helper.queue_free()
	await tree.process_frame
	return true
