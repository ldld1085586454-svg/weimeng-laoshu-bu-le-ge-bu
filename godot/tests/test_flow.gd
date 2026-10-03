extends RefCounted

const Memory = preload("res://tests/helpers/service_memory_store.gd")
const Service = preload("res://services/local_game_service.gd")
const Codec = preload("res://storage/round_codec.gd")
const Round = preload("res://rules/round_reducer.gd")
var wall := 1790956800000
var mono := 0

class RollbackStore extends RefCounted:
	var memory: RefCounted = preload("res://tests/helpers/service_memory_store.gd").new()
	var on_clear: Callable
	func read(key: String) -> Dictionary:
		return memory.read(key)
	func write(key: String, text: String) -> Dictionary:
		if key == "active" and text.is_empty() and on_clear.is_valid():
			on_clear.call()
		return memory.write(key, text)

func run(a) -> bool:
	if not FileAccess.file_exists("res://ui/app_router.gd") or not FileAccess.file_exists("res://ui/play_presenter.gd"):
		a.truth(false, "router and play presenter implementations exist")
		return true
	var script = load("res://ui/app_router.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "router loads")
		return true
	var store := Memory.new()
	var router = script.new()
	router.configure(store, null, func(): return wall, func(): return mono, "flow-player")
	a.truth(router.initialize().ok, "real bootstrap home")
	a.equal(router.snapshot().screen, "home", "first scene home")
	a.equal(router.snapshot().info.profile.tutorialDone, false, "empty profile has no completed tutorial")
	a.truth(store.records.has("identity"), "identity saved in independent store")
	a.truth(router.action("start").ok, "join starts tutorial first")
	a.equal(router.snapshot().ticket.mode, "tutorial", "real tutorial ticket")
	a.equal(router.snapshot().state.initialDeal.cells.size(), 12, "actual twelve tile tutorial")
	for cell in router.snapshot().state.initialDeal.cells:
		mono += 20
		wall += 20
		a.truth(router.pick(cell.id).ok, "natural tutorial pick " + cell.id)
	a.equal(router.snapshot().state.board.status, "WON", "real tutorial reducer reaches won")
	a.equal(router.snapshot().info.profile.tutorialDone, true, "tutorial completion persisted through real service settlement")
	a.equal(router.snapshot().pending, false, "successful settlement clears pending")
	a.equal(router.snapshot().modal, {}, "terminal panel waits for presentation")
	a.equal(router.snapshot().panel_pending.kind, "TUTORIAL_WIN", "tutorial terminal panel queued")
	var final_state: Dictionary = router.snapshot().state
	router.presentation_finished("wrong-round", final_state.revision)
	a.equal(router.snapshot().modal, {}, "stale presentation completion ignored")
	router.presentation_finished(final_state.roundId, final_state.revision)
	a.equal(router.snapshot().modal.kind, "TUTORIAL_WIN", "terminal presentation completion shows tutorial next")
	a.truth(router.action("next-daily").ok, "tutorial next starts daily")
	a.equal(router.snapshot().ticket.mode, "daily", "real daily ticket")
	a.truth(router.snapshot().state.initialDeal.cells.size() in [270, 540, 720], "actual fixed daily board")
	var before: Dictionary = router.snapshot().state
	a.truth(router.action("exit").ok, "exit confirmation shown")
	a.equal(router.snapshot().modal.kind, "EXIT", "exit modal")
	a.equal(router.pick(_available(before)).code, "UI_LOCKED", "modal blocks underlying board")
	a.truth(router.action("cancel-exit").ok, "exit cancellation works")
	a.equal(router.snapshot().state, before, "cancel retains exact board")
	# Presentation input queue capacity is zero.
	router.set_presentation_locked(true)
	a.equal(router.pick(_available(before)).code, "UI_LOCKED", "animation lock rejects pick")
	router.set_presentation_locked(false)
	a.truth(router.action("exit").ok, "exit again")
	a.truth(router.action("confirm-exit").ok, "confirmed exit returns home")
	a.equal(router.snapshot().screen, "home", "confirmed exit home")
	a.truth(router.action("start").ok, "learned profile joins directly daily")
	a.equal(router.snapshot().ticket.mode, "daily", "tutorial skipped after persisted completion")
	# Reach a genuine first loss in the real daily deal, then explicit simulation.
	for i in range(20):
		var state: Dictionary = router.snapshot().state
		if state.board.status == "LOST":
			break
		var tile := _available(state, true)
		a.truth(not tile.is_empty(), "real daily nonmatching legal tile available")
		if tile.is_empty():
			break
		a.truth(router.pick(tile).ok, "real daily loss pick")
	a.equal(router.snapshot().state.board.status, "LOST", "actual seven-slot loss")
	var lost: Dictionary = router.snapshot().state
	router.presentation_finished(lost.roundId, lost.revision)
	a.equal(router.snapshot().modal.kind, "REVIVE", "first loss offers revive")
	a.truth(router.action("revive").ok, "real revive offer from modal action")
	a.equal(router.snapshot().modal.kind, "OFFER", "revive offer modal")
	a.truth(router.action("grant").ok, "explicit simulator launched")
	a.equal(router.snapshot().state.pending.phase, "WAITING", "launch grants nothing")
	store.fail_key = "active"
	store.fail_count = 2
	a.truth(router.action("dev-complete").ok, "observed simulation evidence retained on save failure")
	a.equal(router.snapshot().state.pending.phase, "EARNED", "dirty evidence remains earned")
	a.equal(router.snapshot().modal.kind, "RECOVERY", "application/storage error shows recovery")
	a.equal(router.snapshot().state.used.revive, 0, "failed observed flush consumes no revive")
	a.truth(router.action("recover-grant").ok, "original entitlement retry commits")
	a.equal(router.snapshot().state.used.revive, 1, "one revive consumed after durable apply")
	a.equal(router.snapshot().state.board.status, "PLAYING", "real revive resumes board")
	a.equal(router.snapshot().modal, {}, "recovery closes after successful application")
	a.equal(router.action("dev-complete").code, "NOT_ACTIONABLE", "duplicate completion action no longer available")
	a.equal(router.action("give-up").code, "NOT_ACTIONABLE", "stale hidden modal action cannot submit a live game")
	a.equal(router.snapshot().pending, false, "stale modal action cannot create a pending gate")
	a.truth(router.return_home().ok, "live game returns home")
	# Topic routing and settings use persisted services/preferences.
	a.truth(router.open_menu("topic").ok, "topic menu")
	a.truth(router.action("topic-start").ok, "topic start action")
	a.equal(router.snapshot().ticket.mode, "topic", "real topic ticket")
	a.truth(router.return_home().ok, "topic exit")
	a.truth(router.open_settings().ok, "settings shown")
	var prefs: Dictionary = router.snapshot().prefs
	store.fail_key = "prefs"
	store.fail_count = 1
	a.equal(router.action("setting-sound").ok, false, "preference write failure reported")
	a.equal(router.snapshot().prefs, prefs, "failed preference save rolls back visible value")
	a.truth(router.action("setting-sound").ok, "preference save retry")
	a.equal(router.snapshot().prefs.sound, not prefs.sound, "persisted preference changes")
	a.truth(router.close_modal().ok, "close settings")
	a.truth(router.open_menu("wardrobe").ok, "real wardrobe menu")
	a.equal(router.action("equip:cap").code, "SKIN_LOCKED", "locked skin remains locked")
	a.truth(router.open_menu("bullet").ok, "preset bullet menu")
	a.truth(router.action("send-bullet:" + router.snapshot().info.presetBullets[0].id).ok, "real preset bullet saved")
	a.equal(router.snapshot().info.bullets.size(), 1, "actual saved bullet appears")
	router.free()
	# Restart uses saved identity/prefs and real tutorialDone, not a fixture.
	var restart = script.new()
	restart.configure(store, null, func(): return wall, func(): return mono)
	a.truth(restart.initialize().ok, "restart bootstrap")
	a.equal(restart.snapshot().userId, "flow-player", "original identity restored")
	a.equal(restart.snapshot().prefs.sound, not prefs.sound, "saved preference restored")
	a.truth(restart.action("start").ok, "restart learned profile starts")
	a.equal(restart.snapshot().ticket.mode, "daily", "restart starts daily directly")
	restart.free()
	a.truth(_terminal_failure(a, script), "terminal failure scenarios completed")
	a.truth(_earned_restart(a, script), "earned restart scenarios completed")
	a.truth(_synchronous_finish(a, script), "synchronous presentation finish completed")
	a.truth(_startup_boundaries(a, script), "startup recovery boundaries completed")
	a.truth(_live_earned_expiry(a, script), "live earned expiry cleanup completed")
	a.truth(_dirty_cancel_exit(a, script), "dirty cancellation exit completed")
	a.truth(_prepare_quit(a, script), "normal quit evidence boundary completed")
	a.truth(_expiry_wall_boundary(a, script), "expiry wall boundary completed")
	return true

func _expiry_wall_boundary(a, script) -> bool:
	var original_wall: int = wall
	# The exact fresh-review failure: durable EARNED, displayed EXPIRED,
	# then a wall-clock rollback before the user confirms disposal.
	var store := Memory.new()
	var router = script.new()
	router.configure(store, null, func(): return wall, func(): return mono, "rollback-player")
	a.truth(router.initialize().ok, "rollback bootstrap")
	a.truth(router.action("start").ok, "rollback tutorial")
	a.truth(router.pick("teach-0").ok, "rollback eligibility pick")
	a.truth(router.intent_assist("undo").ok, "rollback offer")
	a.truth(router.action("grant").ok, "rollback launch")
	store.fail_key = "active"
	store.fail_count = 2
	a.truth(router.action("dev-complete").ok, "rollback earned observation")
	a.truth(router.session.flush().ok, "rollback original earned evidence durable")
	var retained: Dictionary = router.snapshot().state
	var token: String = retained.pending.token
	var expiry: int = router.snapshot().ticket.expiresAt
	wall = expiry + 1
	router.set_visible(false)
	router.set_visible(true)
	a.equal(router.snapshot().modal.kind, "EXPIRED", "expiry panel before rollback")
	var archives: Dictionary = store.records.duplicate(true)
	wall = expiry - 1
	a.equal(router.action("expired-home").code, "TICKET_NOT_EXPIRED", "rollback denies disposal before writes")
	a.equal(store.records, archives, "rollback refusal preserves all original archives")
	a.equal(router.snapshot().state.pending.token, token, "rollback refusal retains live earned token")
	a.equal(router.snapshot().modal.kind, "RECOVERY", "rollback exposes current earned recovery")
	a.truth("recover-grant" in router.snapshot().modal.actions, "rollback recovery remains actionable")
	a.truth(router.prepare_quit().ok, "rollback normal close safe with durable archive")
	a.equal(store.records, archives, "normal close after rollback preserves original archived evidence")
	router.free()
	var recovered = script.new()
	recovered.configure(store, null, func(): return wall, func(): return mono)
	a.truth(recovered.initialize().ok, "rollback safe-close original earned archive restores")
	a.equal(recovered.snapshot().state.get("pending", {}).get("token"), token, "rollback safe-close restores original token")
	if recovered.snapshot().modal.get("kind") == "RECOVERY":
		a.truth(recovered.action("recover-grant").ok, "rollback restored entitlement commits")
	recovered.free()
	wall = original_wall
	# An outbox-only terminal has an uninstalled Session but still owns its
	# original validated ticket/scope; rollback must not silently drop it.
	var queued := _terminal_archive("rollback-queue-player")
	queued.store.records.outbox = JSON.stringify({"ticket": queued.ticket, "payload": queued.payload})
	wall = int(queued.ticket.expiresAt) + 1
	var outbox = script.new()
	outbox.configure(queued.store, null, func(): return wall, func(): return mono)
	a.equal(outbox.initialize().code, "CYCLE_EXPIRED", "queue-only original terminal expired")
	a.equal(outbox.session.snapshot(), {}, "queue-only has no installed Session")
	var queued_archives: Dictionary = queued.store.records.duplicate(true)
	wall = int(queued.ticket.expiresAt) - 1
	a.equal(outbox.action("expired-home").code, "TICKET_NOT_EXPIRED", "queue-only rollback also denies disposal")
	a.equal(queued.store.records, queued_archives, "queue-only rollback preserves original payload archives")
	a.truth("retry-settlement" in outbox.snapshot().modal.get("actions", []), "queue-only rollback exposes original settlement retry")
	if "retry-settlement" in outbox.snapshot().modal.get("actions", []):
		a.truth(outbox.action("retry-settlement").ok, "queue-only retry submits original current ticket")
	outbox.free()
	wall = original_wall
	# Capture expiry once. A rollback occurring inside the first cleanup write
	# must not make the post-write memory reset reject an already valid decision.
	var changing := RollbackStore.new()
	var frozen = script.new()
	frozen.configure(changing, null, func(): return wall, func(): return mono, "frozen-wall-player")
	a.truth(frozen.initialize().ok, "frozen boundary bootstrap")
	a.truth(frozen.action("start").ok, "frozen boundary tutorial")
	a.truth(frozen.pick("teach-0").ok, "frozen boundary pick")
	a.truth(frozen.intent_assist("undo").ok, "frozen boundary offer")
	a.truth(frozen.action("grant").ok, "frozen boundary launch")
	changing.memory.fail_key = "active"
	changing.memory.fail_count = 2
	a.truth(frozen.action("dev-complete").ok, "frozen boundary earned")
	a.truth(frozen.session.flush().ok, "frozen boundary evidence durable")
	var frozen_expiry: int = frozen.snapshot().ticket.expiresAt
	wall = frozen_expiry + 1
	frozen.set_visible(false)
	frozen.set_visible(true)
	changing.on_clear = func(): wall = frozen_expiry - 1
	a.truth(frozen.action("expired-home").ok, "validated boundary reused despite rollback during clear")
	a.equal(frozen.session.snapshot(), {}, "frozen boundary resets memory after both clears")
	a.equal(frozen.snapshot().screen, "home", "frozen boundary completes explicit expiry decision")
	a.equal(changing.memory.records.active, "", "frozen boundary active empty")
	a.equal(changing.memory.records.outbox, "", "frozen boundary outbox empty")
	frozen.free()
	wall = original_wall
	return true

func _prepare_quit(a, script) -> bool:
	for observation in ["dev-complete", "dev-cancel"]:
		var store := Memory.new()
		var router = script.new()
		router.configure(store, null, func(): return wall, func(): return mono, "quit-" + observation)
		a.truth(router.initialize().ok, "quit bootstrap " + observation)
		a.truth(router.action("start").ok, "quit tutorial " + observation)
		a.truth(router.pick("teach-0").ok, "quit eligibility pick")
		var normal_archive: String = store.records.active
		store.fail_key = "active"
		store.fail_count = 1
		a.truth(router.prepare_quit().ok, "nondirty close permits quit")
		a.equal(store.fail_count, 1, "nondirty quit performs no storage write")
		a.equal(store.records.active, normal_archive, "nondirty quit does not rewrite active")
		store.fail_count = 0
		a.equal(router.snapshot().screen, "play", "quit preparation does not route home")
		a.truth(router.intent_assist("undo").ok, "quit offer")
		a.truth(router.action("grant").ok, "quit launch")
		var waiting_archive: String = store.records.active
		store.fail_key = "active"
		store.fail_count = 3
		a.truth(router.action(observation).ok, "quit observed result")
		a.truth(router.session.is_dirty(), "quit retains dirty evidence")
		var retained: Dictionary = router.snapshot().state
		var modal: Dictionary = router.snapshot().modal
		var refused: Dictionary = router.prepare_quit()
		a.equal(refused.code, "STORAGE_WRITE_FAILED", "normal close refuses evidence loss on write failure")
		a.equal(refused.ok, false, "normal close must not terminate after failed flush")
		a.truth(refused.message.contains("保存失败"), "quit failure gives human-readable retry guidance")
		a.equal(router.snapshot().screen, "play", "refused quit retains interface")
		a.equal(router.snapshot().state, retained, "refused quit retains original observation/token")
		a.equal(router.snapshot().modal, modal, "refused quit retains modal")
		a.equal(store.records.active, waiting_archive, "refused quit does not clear old archive")
		store.fail_count = 0
		a.truth(router.prepare_quit().ok, "normal close retry flushes evidence")
		a.equal(router.session.is_dirty(), false, "successful quit flush clears dirty")
		var durable: Dictionary = Codec.restore(store.records.active)
		a.truth(durable.ok, "quit preserves a validated active record")
		a.equal(durable.state, retained, "quit archives exact observed state")
		a.equal(store.records.has("outbox"), false, "normal quit does not force settlement")
		if observation == "dev-complete":
			a.equal(durable.state.pending.phase, "EARNED", "quit preserves earned entitlement")
			var token: String = retained.pending.token
			router.free()
			var recovered = script.new()
			recovered.configure(store, null, func(): return wall, func(): return mono)
			a.truth(recovered.initialize().ok, "normal-close earned archive recovers")
			a.equal(recovered.snapshot().modal.kind, "RECOVERY", "normal-close recovery modal")
			a.equal(recovered.snapshot().state.pending.token, token, "normal-close recovery retains original token")
			a.equal(recovered.snapshot().state.commands, retained.commands, "normal-close recovery retains original command log")
			recovered.free()
		else:
			a.equal(durable.state.pending, null, "quit preserves observed cancellation")
			a.equal(durable.state.commands[-1].type, "CANCEL", "quit persists actual cancellation command")
			router.free()
	return true

func _dirty_cancel_exit(a, script) -> bool:
	var store := Memory.new()
	var router = script.new()
	router.configure(store, null, func(): return wall, func(): return mono, "cancel-player")
	a.truth(router.initialize().ok, "dirty cancellation bootstrap")
	a.truth(router.action("start").ok, "dirty cancellation tutorial")
	a.equal(router.action("start").code, "NOT_ACTIONABLE", "stale home start action cannot replace live game")
	a.truth(router.pick("teach-0").ok, "dirty cancellation pick")
	a.truth(router.intent_assist("undo").ok, "dirty cancellation offer")
	a.truth(router.action("grant").ok, "dirty cancellation launch")
	var old_archive: String = store.records.active
	store.fail_key = "active"
	store.fail_count = 3
	a.truth(router.action("dev-cancel").ok, "cancellation observed despite save failure")
	a.equal(router.snapshot().state.pending, null, "cancellation closes reward in memory")
	a.truth(router.session.is_dirty(), "cancellation evidence remains dirty")
	a.equal(router.return_home().code, "STORAGE_WRITE_FAILED", "exit flushes observed cancellation before clearing")
	a.equal(router.snapshot().screen, "play", "failed cancellation evidence flush cannot enter home")
	a.equal(store.records.active, old_archive, "failed exit does not overwrite durable waiting archive")
	a.equal(router.start_mode("daily").code, "STORAGE_WRITE_FAILED", "new start must flush cancellation evidence first")
	a.equal(store.records.active, old_archive, "failed start preserves original archive")
	a.truth(router.return_home().ok, "cancellation evidence flush retry exits")
	a.equal(router.session.is_dirty(), false, "exit no longer leaves permanent dirty gate")
	a.equal(store.records.active, "", "archive cleared only after evidence persisted")
	a.truth(router.action("start").ok, "same session starts after observed cancellation exit")
	router.free()
	return true

func _live_earned_expiry(a, script) -> bool:
	var store := Memory.new()
	var router = script.new()
	router.configure(store, null, func(): return wall, func(): return mono, "live-expiry-player")
	a.truth(router.initialize().ok, "live expiry bootstrap")
	a.truth(router.action("start").ok, "live expiry tutorial")
	a.truth(router.pick("teach-0").ok, "live expiry pick")
	a.truth(router.intent_assist("undo").ok, "live expiry offer")
	a.truth(router.action("grant").ok, "live expiry launch")
	store.fail_key = "active"
	store.fail_count = 2
	a.truth(router.action("dev-complete").ok, "live earned dirty evidence")
	a.equal(router.snapshot().state.pending.phase, "EARNED", "live expiry retains uncommitted earned evidence")
	var original_session: RefCounted = router.session
	var original_wall: int = wall
	wall = int(router.snapshot().ticket.expiresAt) + 1
	router.set_visible(false)
	router.set_visible(true)
	a.equal(router.snapshot().modal.kind, "EXPIRED", "live expired earned exposes explicit exit")
	store.fail_count = 1
	a.equal(router.action("expired-home").code, "STORAGE_WRITE_FAILED", "undurable earned evidence must flush before expiry disposal")
	a.truth(router.snapshot().pending, "failed expiry disposal keeps gate")
	a.equal(router.session.snapshot().pending.phase, "EARNED", "failed expiry evidence flush retains original entitlement")
	a.truth(router.action("expired-home").ok, "expiry evidence flush and both cleanup writes complete")
	a.equal(router.session, original_session, "expiry cleanup preserves Session signal object")
	a.equal(router.session.snapshot(), {}, "same Session memory reset only after durable cleanup")
	a.equal(store.records.active, "", "live expiry active durably empty")
	a.equal(store.records.outbox, "", "live expiry outbox durably empty")
	a.truth(router.action("start").ok, "same Session starts current day after explicit expiry cleanup")
	a.truth(router.snapshot().ticket.createdAt >= wall, "new ticket belongs to current cycle")
	router.free()
	wall = original_wall
	return true

func _startup_boundaries(a, script) -> bool:
	var store := Memory.new()
	store.fail_key = "identity"
	store.fail_count = 1
	var router = script.new()
	router.configure(store, null, func(): return wall, func(): return mono, "load-player")
	a.equal(router.initialize().code, "WRITE_FAILED", "identity write failure shows load error")
	a.equal(router.snapshot().modal.kind, "LOAD_ERROR", "load failure panel")
	a.truth(router.action("retry-load").ok, "retry load persists identity/bootstrap")
	router.free()
	store.records.active = "corrupt active"
	var corrupt = script.new()
	corrupt.configure(store, null, func(): return wall, func(): return mono)
	a.equal(corrupt.initialize().code, "INVALID_SAVE", "corrupt active never becomes playable")
	a.equal(corrupt.snapshot().modal.kind, "LOAD_ERROR", "corrupt active error panel")
	corrupt.free()
	# Existing outbox always wins over a broken active record.
	var archive := _terminal_archive("outbox-player")
	archive.store.records.outbox = JSON.stringify({"ticket": archive.ticket, "payload": archive.payload})
	archive.store.records.active = "corrupt irrelevant active"
	archive.store.fail_key = "social"
	archive.store.fail_count = 1
	var retry = script.new()
	retry.configure(archive.store, null, func(): return wall, func(): return mono)
	a.equal(retry.initialize().code, "WRITE_FAILED", "outbox-first settlement service failure shown")
	a.equal(retry.snapshot().modal.kind, "SETTLEMENT_ERROR", "startup outbox retry panel")
	a.truth(retry.snapshot().pending, "outbox service failure retains gate")
	a.truth(retry.action("retry-settlement").ok, "startup outbox-only retry uses original payload")
	a.equal(retry.snapshot().modal.kind, "TUTORIAL_WIN", "outbox retry reaches confirmed terminal panel")
	a.equal(retry.snapshot().elapsedMs, 123, "outbox recovery restores frozen elapsed")
	retry.free()
	# Accepted result whose response/ack was lost can retry after midnight.
	var accepted := _terminal_archive("accepted-player")
	a.truth(accepted.service.request("accepted-player", "settle", accepted.payload).ok, "original terminal accepted before response loss")
	var original_wall: int = wall
	wall = int(accepted.ticket.expiresAt) + 1
	var late = script.new()
	late.configure(accepted.store, null, func(): return wall, func(): return mono)
	a.truth(late.initialize().ok, "expired local-unacknowledged active checks service acceptance first")
	a.equal(late.snapshot().info.history.records.size(), 1, "response-loss retry creates no duplicate result")
	a.equal(late.snapshot().modal.kind, "TUTORIAL_WIN", "accepted old result shows confirmed terminal")
	a.equal(late.snapshot().elapsedMs, 123, "accepted old result preserves original duration")
	late.free()
	wall = original_wall
	var expired := _terminal_archive("expired-player")
	wall = int(expired.ticket.expiresAt) + 1
	var abandoned = script.new()
	abandoned.configure(expired.store, null, func(): return wall, func(): return mono)
	a.equal(abandoned.initialize().code, "CYCLE_EXPIRED", "unaccepted old terminal stays expired")
	a.equal(abandoned.snapshot().modal.kind, "EXPIRED", "expired panel")
	a.equal(abandoned.start_mode("daily").code, "SETTLEMENT_PENDING", "expired decision blocks until explicit disposal")
	expired.store.fail_key = "outbox"
	expired.store.fail_count = 1
	a.equal(abandoned.action("expired-home").code, "WRITE_FAILED", "expired disposal partial cleanup failure reported")
	a.truth(abandoned.snapshot().pending, "partial expired disposal retains gate")
	a.truth(abandoned.action("expired-home").ok, "explicit expired disposal retry")
	a.equal(abandoned.snapshot().screen, "home", "expired disposal home")
	a.equal(expired.store.records.active, "", "expired active cleared")
	a.equal(expired.store.records.outbox, "", "expired outbox cleared")
	abandoned.free()
	wall = original_wall
	return true

func _terminal_archive(user: String) -> Dictionary:
	var store := Memory.new()
	store.records.identity = JSON.stringify({"id": user})
	var service := Service.new()
	service.configure(store, func(): return wall)
	var start: Dictionary = service.request(user, "start", {"mode": "tutorial"}).data
	var state: Dictionary = Round.create(start.deal, start.ticket.id)
	for cell in start.deal.cells:
		state = Round.dispatch(state, {"id": "flow-archive-" + cell.id, "roundId": start.ticket.id, "expectedRevision": state.revision, "type": "PICK", "tileId": cell.id}).state
	var meta := {"scope": "local:" + user, "ticket": start.ticket, "elapsedMs": 123, "settlementPending": true, "settlementAccepted": false}
	var payload := {"ticketId": start.ticket.id, "log": Codec.encode(state, meta), "elapsedMs": 123}
	meta.settlementPayload = payload
	store.records.active = Codec.encode(state, meta)
	return {"store": store, "service": service, "ticket": start.ticket, "payload": payload}

func _synchronous_finish(a, script) -> bool:
	var router = script.new()
	router.configure(Memory.new(), null, func(): return wall, func(): return mono, "sync-player")
	router.session.committed.connect(func(_before: Dictionary, after: Dictionary, _events: Array): router.presentation_finished(after.roundId, after.revision))
	a.truth(router.initialize().ok, "synchronous presentation bootstrap")
	a.truth(router.action("start").ok, "synchronous presentation tutorial")
	for cell in router.snapshot().state.initialDeal.cells:
		a.truth(router.pick(cell.id).ok, "synchronous presentation tutorial pick")
	a.equal(router.snapshot().state.board.status, "WON", "terminal mirror retained after Session cleanup")
	a.equal(router.session.snapshot(), {}, "settled Session remains cleared")
	a.equal(router.snapshot().modal.get("kind"), "TUTORIAL_WIN", "synchronous finish before queue cannot lose terminal panel")
	a.equal(router.snapshot().panel_pending, {}, "synchronous terminal panel has no orphan pending")
	router.free()
	return true

func _terminal_failure(a, script) -> bool:
	var store := Memory.new()
	var router = script.new()
	router.configure(store, null, func(): return wall, func(): return mono, "terminal-player")
	a.truth(router.initialize().ok, "terminal failure bootstrap")
	a.truth(router.action("start").ok, "terminal failure tutorial")
	var cells: Array = router.snapshot().state.initialDeal.cells
	for i in range(11):
		a.truth(router.pick(cells[i].id).ok, "terminal prefinal pick")
	store.fail_key = "outbox"
	store.fail_count = 1
	a.truth(router.pick(cells[11].id).ok, "final pick publishes even when outbox fails")
	a.truth(router.snapshot().pending, "outbox failure retains pending gate")
	a.equal(router.snapshot().info.profile.tutorialDone, false, "failed settlement never reports completion saved")
	var final: Dictionary = router.snapshot().state
	router.presentation_finished(final.roundId, final.revision)
	a.equal(router.snapshot().modal.kind, "SETTLEMENT_ERROR", "outbox failure panel")
	a.equal(router.start_mode("daily").code, "SETTLEMENT_PENDING", "pending blocks new game")
	var frozen: Dictionary = Codec.restore(store.records.active).meta.settlementPayload
	router.free()
	var recovered = script.new()
	recovered.configure(store, null, func(): return wall, func(): return mono)
	a.truth(recovered.initialize().ok, "missing outbox active terminal reconstructs on restart")
	a.equal(recovered.snapshot().info.profile.tutorialDone, true, "recovered original terminal accepted")
	a.equal(recovered.snapshot().modal.kind, "TUTORIAL_WIN", "restored terminal needs no animation completion")
	a.equal(Codec.restore(frozen.log).state.commands, final.commands, "recovered submission log stayed exact")
	recovered.free()
	return true

func _earned_restart(a, script) -> bool:
	var store := Memory.new()
	var router = script.new()
	router.configure(store, null, func(): return wall, func(): return mono, "earned-player")
	a.truth(router.initialize().ok, "earned bootstrap")
	a.truth(router.action("start").ok, "earned tutorial")
	a.truth(router.pick("teach-0").ok, "undo eligibility pick")
	a.truth(router.intent_assist("undo").ok, "undo offer")
	a.truth(router.action("grant").ok, "undo launch")
	# Commit cannot run while both observed persistence and the dirty flush fail.
	store.fail_key = "active"
	store.fail_count = 2
	a.truth(router.action("dev-complete").ok, "earned evidence observed")
	a.truth(router.session.flush().ok, "earned evidence durable before process exit")
	var saved: Dictionary = Codec.restore(store.records.active)
	router.free()
	var recovered = script.new()
	recovered.configure(store, null, func(): return wall, func(): return mono)
	a.truth(recovered.initialize().ok, "earned archive recovers")
	a.equal(recovered.snapshot().modal.kind, "RECOVERY", "earned recovery modal")
	a.equal(recovered.snapshot().state, saved.state, "earned recovery preserves original log/token/receipts")
	a.equal(recovered.return_home().code, "EARNED_REWARD_MUST_BE_RECOVERED", "earned entitlement cannot be discarded")
	a.truth(recovered.action("recover-grant").ok, "restored original entitlement applies")
	a.equal(recovered.snapshot().state.used.undo, 1, "restored undo applied exactly once")
	recovered.free()
	return true

func _available(state: Dictionary, avoid_triple: bool = false) -> String:
	var board: Dictionary = state.board
	var counts := {}
	for id in board.rack:
		var type: String = board.deal.cells[board.byId[id]].type
		counts[type] = counts.get(type, 0) + 1
	for i in range(board.deal.cells.size()):
		var cell: Dictionary = board.deal.cells[i]
		if not board.taken[i] and board.blockers[i] == 0 and (not avoid_triple or counts.get(cell.type, 0) < 2):
			return cell.id
	return ""
