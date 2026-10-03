extends RefCounted

const Round = preload("res://rules/round_reducer.gd")
const Clock = preload("res://session/active_clock.gd")
const Store = preload("res://tests/helpers/session_memory_store.gd")
const Atomic = preload("res://storage/atomic_store.gd")
var now: int = 0

func run(a) -> bool:
	if not FileAccess.file_exists("res://session/session_controller.gd"):
		a.truth(false, "session controller implementation exists")
		return true
	var script = load("res://session/session_controller.gd")
	var codec = load("res://storage/round_codec.gd")
	if script == null or not script.can_instantiate() or codec == null:
		a.truth(false, "session dependencies load")
		return true
	var args := OS.get_cmdline_user_args()
	if "--session-restart-dir" in args:
		return _restart_child(a, script, codec, args[args.find("--session-restart-dir") + 1])
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/oracle.json"))
	var deal: Dictionary = oracle.cases[0].deal
	var clock = Clock.new(func() -> int: return now)
	var store = Store.new()
	var session = script.new()
	var signals: Array = []
	session.committed.connect(func(before: Dictionary, after: Dictionary, events: Array):
		signals.append({"before": before.duplicate(true), "after": after.duplicate(true), "events": events.duplicate(true), "saved": store.read("active").text}))
	a.truth(session.configure(deal, "session", _meta("session"), store, clock).ok, "new session persisted")
	a.equal(session.snapshot().roundId, "session", "ticket-bound round ID")
	a.equal(clock.elapsed_ms(), 0, "new configure resets base duration")
	var original: Dictionary = session.snapshot()
	store.fail = true
	now = 100
	a.equal(session.send("PICK", {"tileId": "teach-0"}).code, "STORAGE_WRITE_FAILED", "ordinary persistence failure rejected")
	a.equal(session.snapshot(), original, "ordinary write failure leaves state/revision/quotas")
	a.equal(signals.size(), 0, "failed publication emits no committed signal")
	store.fail = false
	a.truth(session.send("PICK", {"tileId": "teach-0"}).ok, "ordinary retry succeeds")
	a.equal(signals.size(), 1, "one signal after publication")
	a.equal(codec.restore(signals[0].saved).state, signals[0].after, "signal observer sees durable published state")
	a.equal(signals[0].before, original, "signal has real before state")
	var isolated: Dictionary = session.snapshot()
	isolated.used.move = 999
	a.equal(session.snapshot().used.move, 0, "snapshot cannot mutate session")
	var accepted_command: Dictionary = session.snapshot().commands[-1]
	var replay_extra := accepted_command.duplicate(true)
	replay_extra.erase("type")
	var replay_writes: int = store.writes
	a.truth(session.send("PICK", replay_extra).replayed, "explicit original command uses restored receipt")
	a.equal(store.writes, replay_writes, "receipt replay does not save again")
	a.equal(signals.size(), 1, "receipt replay emits no duplicate transition")
	var invalid_before: Dictionary = session.snapshot()
	a.equal(session.send("PICK", {"tileId": "teach-1", "roundId": "foreign"}).code, "WRONG_ROUND", "foreign callback rejected")
	a.equal(session.snapshot(), invalid_before, "wrong round preserves session")
	# Reward callbacks are observed; their evidence survives write failure in memory.
	a.truth(session.send("OFFER", {"assist": "undo", "channel": "video"}).ok, "undo offered")
	var token: String = session.snapshot().pending.token
	a.truth(session.send("LAUNCH", {"token": token}).ok, "reward launched")
	store.fail = true
	var completion: Dictionary = session.send("AD_CLOSE", {"token": token, "isEnded": true}, true)
	a.truth(completion.ok, "observed evidence published despite write failure")
	a.equal(completion.saved, false, "observed write status visible")
	a.truth(session.is_dirty(), "observed write failure marks dirty")
	a.equal(session.snapshot().pending.phase, "EARNED", "earned evidence retained in memory")
	var earned: Dictionary = session.snapshot()
	var before_replacement: String = store.read("active").text
	store.fail = false
	a.equal(session.configure(deal, "discarded", _meta("discarded"), store, clock).code, "EARNED_REWARD_MUST_BE_RECOVERED", "new game cannot discard dirty earned evidence")
	a.equal(session.restore(before_replacement, "local", 1000, store, clock).code, "EARNED_REWARD_MUST_BE_RECOVERED", "restore cannot replace dirty earned evidence")
	a.equal(session.snapshot(), earned, "replacement attempts retain original earned state")
	a.equal(session.finish_expired_cleanup(1000).code, "TICKET_NOT_EXPIRED", "current earned ticket cannot be discarded")
	a.equal(session.finish_expired_cleanup(5000).code, "DIRTY_EVIDENCE", "undurable observed evidence cannot be discarded even at expiry")
	store.fail = true
	var count_before: int = signals.size()
	a.equal(session.send("COMMIT", {"token": token}).code, "STORAGE_WRITE_FAILED", "dirty ordinary first flush blocks on failure")
	a.equal(session.snapshot(), earned, "failed flush does not apply or spend assist")
	a.equal(signals.size(), count_before, "failed flush emits no publication")
	store.fail = false
	var writes_before: int = store.writes
	a.truth(session.send("COMMIT", {"token": token}).ok, "flush then apply succeeds")
	a.equal(store.writes - writes_before, 2, "dirty ordinary flushes evidence before candidate save")
	a.equal(session.snapshot().used.undo, 1, "quota spent only after durable commit")
	a.equal(session.is_dirty(), false, "successful commit clears dirty")
	a.equal(session.finish_expired_cleanup(5000).code, "CLEANUP_NOT_COMPLETE", "expiry reset cannot clear memory while archive is still durable")
	a.equal(session.send("AD_CLOSE", {"token": token, "isEnded": true}, true).code, "REWARD_ALREADY_RESOLVED", "duplicate callback grants nothing")
	# New configure clears overlapping pause reasons, and failure preserves prior session.
	session.set_paused("modal", true)
	session.set_paused("hidden", true)
	var old_state: Dictionary = session.snapshot()
	store.fail = true
	a.equal(session.configure(deal, "replacement", _meta("replacement"), store, clock).ok, false, "configure write failure rejected")
	a.equal(session.snapshot(), old_state, "failed configure leaves old state")
	store.fail = false
	a.truth(session.configure(deal, "replacement", _meta("replacement"), store, clock).ok, "replacement configured")
	now += 50
	a.equal(clock.elapsed_ms(), 50, "replacement clears old pauses")
	a.equal(session.configure(deal, "wrong", _meta("other"), store, clock).code, "INVALID_SAVE_META", "ticket ID must equal round ID")
	# Pauses overlap. Animation has no pause path and remains active time.
	session.set_paused("modal", true)
	session.set_paused("hidden", true)
	now += 100
	session.set_paused("modal", false)
	now += 100
	a.equal(clock.elapsed_ms(), 50, "closing modal while hidden stays paused")
	session.set_paused("hidden", false)
	now += 75
	a.equal(clock.elapsed_ms(), 125, "all pause reasons cleared resumes")
	a.truth(session.send("PICK", {"tileId": "teach-0"}).ok, "ordinary pick")
	now += 185
	a.equal(clock.elapsed_ms(), 310, "pick animation time counts")
	# Restore each earned fixture step exactly; no create substitute or new token.
	for fixture in oracle.cases:
		for step in fixture.steps:
			var state: Dictionary = step.result.state
			if state.pending == null or state.pending.phase != "EARNED":
				continue
			var meta := _meta(state.roundId)
			meta.elapsedMs = 765
			meta.hidden = true
			var text: String = codec.encode(state, meta)
			var restored = script.new()
			var restore_clock = Clock.new(func() -> int: return now)
			a.equal(restored.restore(text, "local", 1000, Store.new(), restore_clock).action, "recover_earned", fixture.name + " earned restore")
			a.equal(restored.snapshot(), state, fixture.name + " exact state restored")
			a.equal(restored.metadata().elapsedMs, 765, "duration base retained")
			now += 200
			a.equal(restore_clock.elapsed_ms(), 765, "recovery modal pauses restored clock")
			restored.set_paused("modal", false)
			now += 200
			a.equal(restore_clock.elapsed_ms(), 765, "hidden overlaps recovery modal")
			var commit: Dictionary = restored.send("COMMIT", {"token": state.pending.token})
			a.truth(commit.ok, "original restored entitlement applies")
			restored.set_paused("hidden", false)
			now += 10
			a.equal(restore_clock.elapsed_ms(), 775, "restored clock resumes from original base")
	# Unconfirmed first failure is not resumed. Confirmed loss uses metadata only.
	for fixture in oracle.cases:
		for step in fixture.steps:
			var state: Dictionary = step.result.state
			if state.board.status != "LOST" or state.pending != null or state.used.revive != 0:
				continue
			var lost = script.new()
			var lost_store = Store.new()
			var lost_clock = Clock.new(func() -> int: return now)
			a.equal(lost.restore(codec.encode(state, _meta(state.roundId)), "local", 1000, lost_store, lost_clock).action, "none", "first unconfirmed loss not resumed")
			a.equal(lost.snapshot(), {}, "none recovery installs no gameplay")
			var meta := _meta(state.roundId)
			meta.settlementPending = true
			a.equal(lost.restore(codec.encode(state, meta), "local", 1000, lost_store, lost_clock).action, "settle_terminal", "confirmed loss restored")
			a.equal(lost.snapshot().commands, state.commands, "confirmation adds no invented reducer command")
	# Won record survives outbox failure; exact payload freezes before enqueue.
	var won: Dictionary = oracle.cases[0].steps[-1].result.state
	var terminal_session = script.new()
	var terminal_store = Store.new()
	var terminal_clock = Clock.new(func() -> int: return now)
	var terminal_meta := _meta(won.roundId)
	terminal_meta.elapsedMs = 6789
	a.equal(terminal_session.restore(codec.encode(won, terminal_meta), "local", 1000, terminal_store, terminal_clock).action, "settle_terminal", "won restored without outbox")
	terminal_store.fail = true
	a.equal(terminal_session.prepare_terminal().code, "STORAGE_WRITE_FAILED", "terminal intent must persist before enqueue")
	a.equal(terminal_session.metadata().settlementPending, false, "failed terminal intent is not published")
	terminal_store.fail = false
	var prepared: Dictionary = terminal_session.prepare_terminal()
	a.truth(prepared.ok, "terminal intent persisted")
	a.equal(prepared.payload.elapsedMs, 6789, "terminal duration frozen")
	a.equal(prepared.payload.ticketId, won.roundId, "same ticket submission")
	a.equal(codec.restore(prepared.payload.log).state.commands, won.commands, "same final command log")
	var durable: String = terminal_store.read("active").text
	now += 10000
	a.equal(terminal_clock.elapsed_ms(), 6789, "terminal retry waits do not accrue")
	a.equal(terminal_session.prepare_terminal().payload, prepared.payload, "repeat uses exact payload")
	var restarted = script.new()
	a.equal(restarted.restore(durable, "local", 1000, Store.new(), Clock.new(func() -> int: return now)).action, "settle_terminal", "active restarts after missing outbox")
	a.equal(restarted.prepare_terminal().payload, prepared.payload, "restart retains identical frozen submission")
	terminal_store.fail = true
	a.equal(terminal_session.mark_settlement_accepted().ok, false, "accepted metadata write failure reported")
	a.equal(terminal_session.metadata().settlementAccepted, false, "failed acknowledgement stays unaccepted locally")
	var expired = script.new()
	var expiry: Dictionary = expired.restore(durable, "local", 5000, Store.new(), Clock.new(func() -> int: return now))
	a.equal(expiry.code, "CYCLE_EXPIRED", "expired unacknowledged terminal never resumes gameplay")
	a.equal(expired.snapshot(), {}, "expired terminal installs no state")
	a.equal(expiry.payload, prepared.payload, "response-loss boundary exposes exact payload for accepted-first service lookup")
	terminal_store.fail = false
	a.truth(terminal_session.mark_settlement_accepted().ok, "durable acceptance acknowledgement")
	a.equal(expired.restore(terminal_store.read("active").text, "local", 5000, Store.new(), Clock.new(func() -> int: return now)).action, "settle_terminal", "accepted terminal can retry cleanup after midnight")
	a.equal(terminal_session.configure(deal, "blocked", _meta("blocked"), terminal_store, terminal_clock).code, "SETTLEMENT_PENDING", "new game blocked until both cleanup writes complete")
	var retained: Dictionary = terminal_session.snapshot()
	a.equal(terminal_session.restore(durable, "local", 1000, terminal_store, terminal_clock).code, "SETTLEMENT_PENDING", "restore cannot overwrite an existing pending transaction")
	a.equal(terminal_session.snapshot(), retained, "rejected pending restore retains original state")
	terminal_store.fail = true
	a.equal(terminal_session.clear_after_settlement().ok, false, "active cleanup failure reported")
	a.truth(terminal_session.metadata().settlementPending, "failed cleanup retains pending gate")
	terminal_store.fail = false
	a.truth(terminal_session.clear_after_settlement().ok, "active cleanup durable")
	a.equal(terminal_store.read("active").text, "", "active cleared before outbox")
	a.truth(terminal_session.metadata().settlementPending, "active cleanup alone retains pending gate")
	a.equal(terminal_session.flush().code, "ACTIVE_CLEARED", "flush cannot republish active during partial cleanup")
	a.equal(terminal_store.read("active").text, "", "partial cleanup active remains empty")
	a.truth(terminal_session.mark_settlement_accepted().ok, "acknowledgement retry after partial cleanup is idempotent")
	a.equal(terminal_store.read("active").text, "", "ack retry cannot republish already cleared active")
	a.equal(terminal_session.finish_settlement_cleanup().ok, true, "queue signals both records durably clear")
	a.equal(terminal_session.snapshot(), {}, "completed cleanup releases session")
	a.equal(terminal_session.finish_settlement_cleanup().code, "ACTIVE_NOT_CLEARED", "cleanup finish requires durable active-clear boundary")
	# Recovery scope/errors cannot leak original terminal payload or install a game.
	var denied = script.new()
	var denied_clock = Clock.new(func() -> int: return now)
	var wrong_scope: Dictionary = denied.restore(durable, "other", 1000, Store.new(), denied_clock)
	a.equal(wrong_scope.code, "WRONG_SCOPE", "restore rejects foreign scope")
	a.equal(wrong_scope.has("payload"), false, "foreign scope does not expose settlement payload")
	a.equal(denied.restore("bad", "local", 1000, Store.new(), denied_clock).code, "INVALID_SAVE", "restore rejects corrupt envelope")
	a.equal(denied.snapshot(), {}, "recovery errors install no session")
	# Waiting is interrupted through the reducer and durably saved without resuming.
	for fixture in oracle.cases:
		var found_waiting := false
		for step in fixture.steps:
			var state: Dictionary = step.result.state
			if state.pending == null or state.pending.phase != "WAITING":
				continue
			found_waiting = true
			var waiting = script.new()
			var waiting_store = Store.new()
			var waiting_text: String = codec.encode(state, _meta(state.roundId))
			waiting_store.fail = true
			a.equal(waiting.restore(waiting_text, "local", 1000, waiting_store, denied_clock).code, "STORAGE_WRITE_FAILED", "waiting interruption persist failure reported")
			a.equal(waiting.snapshot(), {}, "failed waiting cleanup installs no gameplay")
			waiting_store.fail = false
			a.equal(waiting.restore(waiting_text, "local", 1000, waiting_store, denied_clock).action, "none", "waiting interrupted without resuming")
			var interrupted: Dictionary = codec.restore(waiting_store.read("active").text)
			a.equal(interrupted.state.pending, null, "waiting interruption durably closes entitlement")
			a.equal(interrupted.state.used, state.used, "waiting interruption grants no quota")
			a.equal(interrupted.state.commands[-1].type, "INTERRUPT", "waiting cleanup logs real command")
			a.equal(waiting.snapshot(), {}, "waiting cleanup does not install gameplay")
			break
		if found_waiting:
			break
	# Slow storage must not change the frozen duration or count retry waits.
	var timed = script.new()
	var slow_store = Store.new()
	var timed_clock = Clock.new(func() -> int: return now)
	a.truth(timed.configure(deal, "timed", _meta("timed"), slow_store, timed_clock).ok, "timed session configured")
	for i in range(11):
		a.truth(timed.send("PICK", {"tileId": "teach-" + str(i)}).ok, "timed preterminal pick")
	now += 123
	slow_store.on_write = func(): now += 500
	a.truth(timed.send("PICK", {"tileId": "teach-11"}).ok, "slow terminal save")
	a.equal(timed_clock.elapsed_ms(), 123, "terminal storage wait not counted")
	a.equal(codec.restore(slow_store.read("active").text).meta.elapsedMs, 123, "clock and saved terminal duration agree")
	for fixture in oracle.cases:
		if fixture.name != "revive-append-existing-buffer":
			continue
		var live = script.new()
		var live_store = Store.new()
		var live_clock = Clock.new(func() -> int: return now)
		a.truth(live.configure(fixture.deal, fixture.roundId, _meta(fixture.roundId), live_store, live_clock).ok, "live lost/revive lifecycle configured")
		for step in fixture.steps:
			var extra: Dictionary = step.command.duplicate(true)
			extra.erase("type")
			now += 10
			a.truth(live.send(step.command.type, extra, step.command.type == "AD_CLOSE").ok, "live original loss/revive command")
			if live.snapshot().board.status == "LOST":
				var paused_duration: int = live_clock.elapsed_ms()
				now += 40
				a.equal(live_clock.elapsed_ms(), paused_duration, "loss and reward dialogs remain paused")
		now += 75
		var final_duration: int = live_clock.elapsed_ms()
		a.truth(live.send("PICK", {"tileId": "t1"}).ok, "live second loss")
		a.equal(live.snapshot().board.status, "LOST", "live second loss is terminal")
		now += 1000
		a.equal(live_clock.elapsed_ms(), final_duration, "second loss freezes clock for settlement retries")
		var replayed = script.new()
		a.equal(replayed.restore(live_store.read("active").text, "local", 1000, live_store, live_clock).action, "settle_terminal", "second loss restored with original exhausted revive state")
	# Persist/recover in an actual second headless process with isolated storage.
	var temporary := DirAccess.create_temp("bu-le-ge-session-restart")
	a.truth(temporary != null, "restart isolated temporary namespace")
	if temporary != null:
		var disk = Atomic.new(temporary.get_current_dir())
		for fixture in oracle.cases:
			for step in fixture.steps:
				var state: Dictionary = step.result.state
				if state.pending != null and state.pending.phase == "EARNED":
					var persisted_meta := _meta(state.roundId)
					persisted_meta.elapsedMs = 321
					a.truth(disk.write("earned", codec.encode(state, persisted_meta)).ok, "restart earned seed durable")
					break
			if disk.read("earned").ok:
				break
		a.truth(disk.write("terminal", durable).ok, "restart frozen terminal seed durable")
		var output: Array = []
		var child_code := OS.execute(OS.get_executable_path(), ["--headless", "--path", ProjectSettings.globalize_path("res://"), "--script", "res://tests/run.gd", "--", "--suite", "session", "--session-restart-dir", temporary.get_current_dir()], output, true)
		a.equal(child_code, 0, "cross-process restart passes: " + str(output).left(1000))
		a.truth(str(output).contains("PASS session"), "restart child suite completed")
		if child_code == 0:
			print("PASS session_restart (second headless process)")
	return true

func _restart_child(a, script, codec, directory: String) -> bool:
	var disk = Atomic.new(directory)
	var earned: Dictionary = codec.restore(disk.read("earned").text)
	a.truth(earned.ok, "child reads earned committed generation")
	if not earned.ok:
		return true
	var session = script.new()
	var clock = Clock.new(func() -> int: return now)
	a.equal(session.restore(disk.read("earned").text, "local", 1000, disk, clock).action, "recover_earned", "child recovers earned reward")
	a.equal(session.snapshot(), earned.state, "child exact original earned state")
	a.equal(clock.elapsed_ms(), 321, "child saved elapsed base")
	a.truth(session.send("COMMIT", {"token": earned.state.pending.token}).ok, "child original token commits once")
	a.equal(session.snapshot().used[earned.state.pending.assist], 1, "child applies original entitlement once")
	var terminal_text: String = disk.read("terminal").text
	var terminal: Dictionary = codec.restore(terminal_text)
	var recovered = script.new()
	a.equal(recovered.restore(terminal_text, "local", 1000, disk, clock).action, "settle_terminal", "child recovers missing outbox terminal")
	a.equal(recovered.prepare_terminal().payload, terminal.meta.settlementPayload, "child identical frozen terminal payload")
	return true

func _meta(id: String) -> Dictionary:
	return {"scope": "local", "ticket": {"id": id, "expiresAt": 5000}, "elapsedMs": 0, "settlementPending": false, "settlementAccepted": false}
