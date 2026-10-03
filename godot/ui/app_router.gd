extends Node

const Atomic = preload("res://storage/atomic_store.gd")
const Service = preload("res://services/local_game_service.gd")
const Session = preload("res://session/session_controller.gd")
const Clock = preload("res://session/active_clock.gd")
const Queue = preload("res://services/settlement_queue.gd")
const Codec = preload("res://storage/round_codec.gd")
const Preferences = preload("res://ui/preferences.gd")
const Presenter = preload("res://ui/play_presenter.gd")
const Simulator = preload("res://platform/simulation_reward_adapter.gd")

signal changed

# The same Session object is kept throughout routing so presentation can bind
# its committed signal once. The router never applies a board mutation itself.
var session: RefCounted = Session.new()
var clock: RefCounted
var _store: RefCounted
var _service: RefCounted
var _queue: RefCounted = Queue.new()
var _preferences: RefCounted = Preferences.new()
var _presenter: RefCounted = Presenter.new()
var _simulator: RefCounted = Simulator.new()
var _wall_now: Callable
var _user_id := ""
var _requested_id := ""
var _scope := ""
var _screen := "home"
var _page := ""
var _info: Dictionary = {}
var _prefs: Dictionary = {}
var _ticket: Dictionary = {}
var _state: Dictionary = {}
var _modal: Dictionary = {}
var _panel_pending: Dictionary = {}
var _error := ""
var _notice := ""
var _settlement_pending := false
var _visible := true
var _presentation_locked := false
var _initialized := false
var _after_tutorial := "daily"
var _completed_presentation: Dictionary = {}

func _init() -> void:
	_simulator.result.connect(_on_reward)
	session.committed.connect(_on_committed)

func _on_committed(_before: Dictionary, after: Dictionary, _events: Array) -> void:
	_state = after.duplicate(true)

func configure(store: RefCounted = null, service: RefCounted = null, wall_now: Callable = Callable(), mono_now: Callable = Callable(), user_id: String = "") -> void:
	_store = store if store != null else Atomic.new()
	_service = service if service != null else Service.new()
	_wall_now = wall_now if wall_now.is_valid() else func() -> int: return int(Time.get_unix_time_from_system() * 1000)
	clock = Clock.new(mono_now)
	_requested_id = user_id

func initialize() -> Dictionary:
	if _store == null:
		configure()
	_error = ""
	var identity: Dictionary = _store.read("identity")
	if not identity.ok and identity.code != "MISSING":
		return _load_error(identity.code)
	if identity.ok:
		var parser := JSON.new()
		if parser.parse(identity.text) != OK or not parser.data is Dictionary or not parser.data.get("id") is String or not _valid_id(parser.data.id):
			return _load_error("INVALID_IDENTITY")
		_user_id = parser.data.id
	else:
		_user_id = _requested_id if not _requested_id.is_empty() else "local-" + Crypto.new().generate_random_bytes(12).hex_encode()
		if not _valid_id(_user_id):
			return _load_error("INVALID_IDENTITY")
		var saved: Dictionary = _store.write("identity", JSON.stringify({"id": _user_id}))
		if not saved.ok:
			return _load_error(saved.code)
	_scope = "local:" + _user_id
	var preferences: Dictionary = _preferences.load(_store)
	_prefs = preferences.prefs
	if not preferences.ok:
		_notice = "设置记录读取失败，使用默认设置：" + preferences.code
	_service.configure(_store, _wall_now)
	if not _refresh().ok:
		return _load_error(_error)
	_initialized = true
	_queue.configure(_store)
	var health: Dictionary = _queue.status()
	if not health.ok:
		return _load_error(health.code)
	if not _queue.pending().is_empty():
		return _recover_outbox()
	# A retry may occur after terminal preparation succeeded but enqueue failed.
	if session.metadata().get("settlementPending", false):
		_screen = "play"
		return _settle(false)
	var active: Dictionary = _store.read("active")
	if not active.ok and active.code != "MISSING":
		return _load_error(active.code)
	if active.ok and not active.text.is_empty():
		var restored: Dictionary = session.restore(active.text, _scope, int(_wall_now.call()), _store, clock)
		if not restored.ok:
			if restored.code == "CYCLE_EXPIRED":
				if restored.has("payload"):
					_ticket = restored.ticket.duplicate(true)
					var decoded: Dictionary = Codec.restore(restored.payload.log)
					_state = decoded.state if decoded.ok else {}
					var enqueued: Dictionary = _queue.enqueue(restored.payload, restored.ticket)
					if not enqueued.ok:
						return _settlement_error(enqueued.code, false)
					return _recover_outbox()
				# Recovery already verified this archive's scope and ticket. Keep
				# its identity for the explicit disposal boundary without installing it.
				var expired: Dictionary = Codec.restore(active.text)
				_ticket = expired.meta.ticket.duplicate(true)
				_show("EXPIRED", {}, ["expired-home"])
				_error = restored.code
				changed.emit()
				return restored
			return _load_error(restored.code)
		if restored.action != "none":
			_state = session.snapshot()
			_ticket = session.metadata().ticket
			_presenter.bind_session(session, _ticket)
			_screen = "play"
			if restored.action == "recover_earned":
				_show("RECOVERY", {"pending": _state.pending, "simulation": true}, ["recover-grant"])
				changed.emit()
				return _ok("RECOVERED")
			return _settle(false)
	_screen = "home"
	_state = {}
	_ticket = {}
	_modal = {}
	_panel_pending = {}
	changed.emit()
	return _ok("INITIALIZED")

func start_mode(mode: String) -> Dictionary:
	if _settlement_pending or session.metadata().get("settlementPending", false) or not _queue.pending().is_empty():
		return _fail("SETTLEMENT_PENDING")
	if not _initialized or not _visible:
		return _fail("UI_LOCKED")
	var live: Dictionary = session.snapshot()
	if live.get("pending") != null:
		return _fail("EARNED_REWARD_MUST_BE_RECOVERED" if live.pending.phase == "EARNED" else "REWARD_PENDING")
	if session.is_dirty():
		var persisted: Dictionary = session.flush()
		if not persisted.ok: return _fail(persisted.code)
	if mode not in ["tutorial", "daily", "topic"]:
		return _fail("INVALID_MODE")
	_after_tutorial = mode if mode != "tutorial" else "daily"
	var actual := "tutorial" if mode != "tutorial" and not _info.profile.tutorialDone else mode
	var started: Dictionary = _service.request(_user_id, "start", {"mode": actual})
	if not started.ok:
		return _fail(started.code)
	var ticket: Dictionary = started.data.ticket
	var configured: Dictionary = session.configure(started.data.deal, ticket.id, {"ticket": ticket, "scope": _scope, "elapsedMs": 0, "settlementPending": false}, _store, clock)
	if not configured.ok:
		return _fail(configured.code)
	_ticket = ticket.duplicate(true)
	_state = session.snapshot()
	_presenter.bind_session(session, _ticket)
	_screen = "play"
	_page = ""
	_modal = {}
	_panel_pending = {}
	_presentation_locked = false
	_error = ""
	_notice = ""
	changed.emit()
	return _ok("STARTED")

func return_home() -> Dictionary:
	if _settlement_pending or session.metadata().get("settlementPending", false) or not _queue.pending().is_empty():
		return _fail("SETTLEMENT_PENDING")
	var live: Dictionary = session.snapshot()
	if live.get("pending") != null:
		if live.pending.phase == "EARNED":
			return _fail("EARNED_REWARD_MUST_BE_RECOVERED")
		return _fail("REWARD_PENDING")
	if session.is_dirty():
		var persisted: Dictionary = session.flush()
		if not persisted.ok: return _fail(persisted.code)
	if not live.is_empty():
		var cleared: Dictionary = _store.write("active", "")
		if not cleared.ok:
			return _fail(cleared.code)
	clock.stop()
	if not _refresh().ok:
		return _fail(_error)
	_screen = "home"
	_page = ""
	_modal = {}
	_panel_pending = {}
	_state = {}
	_ticket = {}
	_presentation_locked = false
	changed.emit()
	return _ok("HOME")

func prepare_quit() -> Dictionary:
	if session.is_dirty():
		var persisted: Dictionary = session.flush()
		if not persisted.ok:
			_notice = "保存失败，暂不能关闭；请修复存储后重试。"
			changed.emit()
			return {"ok": false, "code": persisted.code, "message": _notice}
	return _ok("QUIT_READY")

func pick(tile_id: String) -> Dictionary:
	_presenter.set_input_allowed(_board_input())
	var result: Dictionary = _presenter.intent_pick(tile_id)
	if not result.ok:
		return _fail(result.code)
	_state = session.snapshot()
	_after_round(true)
	changed.emit()
	return result

func intent_assist(assist: String) -> Dictionary:
	var permitted: bool = _board_input() or (_screen == "play" and _modal.get("kind") == "REVIVE" and assist == "revive" and _visible and not _presentation_locked and not _settlement_pending)
	_presenter.set_input_allowed(permitted)
	var result: Dictionary = _presenter.intent_assist(assist)
	if not result.ok:
		return _fail(result.code)
	_state = session.snapshot()
	_show("OFFER", {"pending": _state.pending, "simulation": true}, ["grant", "cancel-offer"])
	changed.emit()
	return result

func open_menu(page: String) -> Dictionary:
	if _screen == "play" or _settlement_pending or not _initialized or not _modal.is_empty() or not _visible:
		return _fail("UI_LOCKED")
	if page not in ["rank", "friends", "topic", "honor", "profile", "wardrobe", "club", "bullet", "about"]:
		return _fail("UNKNOWN_PAGE")
	if not _refresh().ok:
		return _fail(_error)
	_page = page
	if page == "topic":
		_show("TOPIC", _info.topic, ["topic-start", "close"])
	else:
		_screen = "social"
		_modal = {}
	changed.emit()
	return _ok("MENU")

func open_settings() -> Dictionary:
	if not _initialized or _settlement_pending or _state.get("pending") != null or not _modal.is_empty() or not _panel_pending.is_empty() or _presentation_locked or not _visible:
		return _fail("UI_LOCKED")
	_show("SETTINGS", _prefs, ["setting-music", "setting-sound", "setting-vibration", "setting-bullets", "setting-reducedMotion", "close"])
	changed.emit()
	return _ok("SETTINGS")

func close_modal() -> Dictionary:
	if "close" not in _modal.get("actions", []):
		return _fail("NOT_ACTIONABLE")
	_modal = {}
	session.set_paused("modal", false)
	changed.emit()
	return _ok("CLOSED")

func action(id: String) -> Dictionary:
	# Action buttons are allowed only on the current modal/page; keyboard or
	# stale UI callbacks cannot activate a hidden underlying control.
	if not _modal.is_empty() and id not in _modal.actions:
		return _fail("NOT_ACTIONABLE")
	if _modal.is_empty() and id in ["next-daily", "topic-start", "restart", "cancel-exit", "confirm-exit", "close", "grant", "recover-grant", "cancel-offer", "revive", "give-up", "retry-settlement", "expired-home", "retry-load", "dev-complete", "dev-cancel", "dev-fail"]:
		return _fail("NOT_ACTIONABLE")
	match id:
		"retry-load": return initialize()
		"start":
			return start_mode("daily") if _screen == "home" and _modal.is_empty() else _fail("NOT_ACTIONABLE")
		"next-daily": return start_mode(_after_tutorial)
		"topic-start": return start_mode("topic")
		"return-home":
			return return_home() if _screen != "play" or not _modal.is_empty() else _fail("NOT_ACTIONABLE")
		"restart": return start_mode(_ticket.get("mode", "daily"))
		"exit":
			if not _board_input(): return _fail("UI_LOCKED")
			_show("EXIT", {}, ["cancel-exit", "confirm-exit"])
			changed.emit()
			return _ok("EXIT_CONFIRMATION")
		"cancel-exit":
			_modal = {}
			session.set_paused("modal", false)
			changed.emit()
			return _ok("CONTINUED")
		"confirm-exit": return return_home()
		"close": return close_modal()
		"grant": return _launch_reward()
		"recover-grant": return _commit_reward()
		"cancel-offer": return _cancel_offer()
		"revive": return intent_assist("revive")
		"give-up", "retry-settlement": return _settle(false)
		"expired-home": return _discard_expired()
		"dev-complete":
			if _modal.get("kind") != "PROVIDER": return _fail("NOT_ACTIONABLE")
			if _state.pending.channel == "share":
				_simulator.share_hide()
				_simulator.share_return()
			else: _simulator.complete_video()
			return _ok("SIMULATED_OBSERVATION")
		"dev-cancel":
			if _modal.get("kind") != "PROVIDER": return _fail("NOT_ACTIONABLE")
			_simulator.cancel()
			return _ok("SIMULATED_CANCEL")
		"dev-fail":
			if _modal.get("kind") != "PROVIDER": return _fail("NOT_ACTIONABLE")
			_simulator.fail_request()
			return _ok("SIMULATED_FAILURE")
	if id.begins_with("setting-"):
		var key := id.trim_prefix("setting-")
		if not _prefs.has(key) or _modal.get("kind") != "SETTINGS": return _fail("NOT_ACTIONABLE")
		var draft := _prefs.duplicate()
		draft[key] = not draft[key]
		var saved: Dictionary = _preferences.save(_store, draft)
		if not saved.ok: return _fail(saved.code)
		_prefs = saved.prefs
		_modal.model = _prefs.duplicate()
		changed.emit()
		return _ok("PREFERENCES_SAVED")
	if id.begins_with("equip:") and _screen == "social" and _page == "wardrobe":
		return _social_action("equip", {"skin": id.trim_prefix("equip:")})
	if id.begins_with("send-bullet:") and _screen == "social" and _page == "bullet":
		return _social_action("bullet", {"id": id.trim_prefix("send-bullet:")})
	return _fail("NOT_ACTIONABLE")

func set_visible(value: bool) -> void:
	_visible = value
	session.set_paused("hidden", not value)
	if value and not _ticket.is_empty() and int(_wall_now.call()) >= _ticket.expiresAt and not _settlement_pending:
		_show("EXPIRED", {}, ["expired-home"])
		_error = "CYCLE_EXPIRED"
	changed.emit()

func set_presentation_locked(value: bool) -> void:
	_presentation_locked = value

func presentation_finished(round_id: String, revision: int) -> void:
	if _state.is_empty() or _state.roundId != round_id or _state.revision != revision:
		return
	_completed_presentation = {"roundId": round_id, "revision": revision}
	_presentation_locked = false
	if _panel_pending.is_empty() or _panel_pending.roundId != round_id or _panel_pending.revision != revision:
		return
	var panel := _panel_pending.duplicate(true)
	_panel_pending = {}
	_presentation_locked = false
	_show(panel.kind, panel.model, panel.actions)
	changed.emit()

func snapshot() -> Dictionary:
	return {"screen": _screen, "page": _page, "state": _state.duplicate(true), "ticket": _ticket.duplicate(true), "info": _info.duplicate(true), "prefs": _prefs.duplicate(), "modal": _modal.duplicate(true), "panel_pending": _panel_pending.duplicate(true), "error": _error, "notice": _notice, "pending": _settlement_pending, "userId": _user_id, "elapsedMs": clock.elapsed_ms() if clock != null else 0, "assist": _presenter.assists()}

func _launch_reward() -> Dictionary:
	if _state.get("pending") == null: return _fail("NO_PENDING_REWARD")
	var pending: Dictionary = _state.pending
	var launched: Dictionary = session.send("LAUNCH", {"token": pending.token})
	if not launched.ok: return _fail(launched.code)
	_state = session.snapshot()
	_show("PROVIDER", {"pending": _state.pending, "simulation": true}, ["dev-complete", "dev-cancel", "dev-fail"])
	_simulator.launch({"roundId": _ticket.id, "token": pending.token, "assist": pending.assist, "channel": pending.channel})
	changed.emit()
	return launched

func _on_reward(event: Dictionary) -> void:
	if event.get("roundId") != _ticket.get("id"):
		return
	var types := {"ad_close": "AD_CLOSE", "share_hide": "SHARE_HIDE", "share_return": "SHARE_RETURN", "failed": "FAIL", "cancelled": "CANCEL"}
	if not types.has(event.get("kind")): return
	var extra := {"token": event.get("token"), "roundId": event.roundId}
	if event.has("isEnded"): extra.isEnded = event.isEnded
	var observed: Dictionary = session.send(types[event.kind], extra, true)
	if not observed.ok:
		_fail(observed.code)
		return
	_state = session.snapshot()
	if _state.pending != null and _state.pending.phase == "EARNED":
		_commit_reward()
	elif _state.pending == null:
		_modal = {}
		session.set_paused("modal", false)
		_notice = observed.code
		if _state.board.status == "LOST": _show("REVIVE", {}, ["revive", "give-up"])
	changed.emit()

func _commit_reward() -> Dictionary:
	if _state.get("pending") == null: return _fail("NO_PENDING_REWARD")
	var committed: Dictionary = session.send("COMMIT", {"token": _state.pending.token})
	_state = session.snapshot()
	if not committed.ok:
		_show("RECOVERY", {"pending": _state.pending, "simulation": true}, ["recover-grant"])
		return _fail(committed.code)
	_modal = {}
	session.set_paused("modal", false)
	_error = ""
	_after_round(true)
	changed.emit()
	return committed

func _cancel_offer() -> Dictionary:
	if _state.get("pending") == null: return _fail("NO_PENDING_REWARD")
	var cancelled: Dictionary = session.send("CANCEL", {"token": _state.pending.token})
	if not cancelled.ok: return _fail(cancelled.code)
	_state = session.snapshot()
	_modal = {}
	session.set_paused("modal", false)
	if _state.board.status == "LOST": _show("REVIVE", {}, ["revive", "give-up"])
	changed.emit()
	return cancelled

func _after_round(defer_panel: bool) -> void:
	if _state.board.status == "WON" or (_state.board.status == "LOST" and _state.used.revive > 0):
		_settle(defer_panel)
	elif _state.board.status == "LOST":
		_panel("REVIVE", {}, ["revive", "give-up"], defer_panel)

func _settle(defer_panel: bool) -> Dictionary:
	if session.snapshot().is_empty() and not _queue.pending().is_empty():
		return _recover_outbox()
	var live: Dictionary = session.snapshot()
	if live.is_empty() or live.pending != null or live.board.status not in ["WON", "LOST"]:
		return _fail("ROUND_NOT_TERMINAL")
	_settlement_pending = true
	if not session.snapshot().is_empty(): _state = session.snapshot()
	var prepared: Dictionary = session.prepare_terminal()
	if not prepared.ok: return _settlement_error(prepared.code, defer_panel)
	_queue.configure(_store, session)
	var queued: Dictionary = _queue.enqueue(prepared.payload, _ticket)
	if not queued.ok: return _settlement_error(queued.code, defer_panel)
	var accepted: Dictionary = _queue.retry(_service, _user_id)
	if not accepted.ok: return _settlement_error(accepted.code, defer_panel)
	return _accepted_terminal(defer_panel)

func _recover_outbox() -> Dictionary:
	var queued: Dictionary = _queue.pending()
	var decoded: Dictionary = Codec.restore(queued.payload.log)
	if not decoded.ok: return _load_error(decoded.code)
	if decoded.meta.scope != _scope or queued.ticket.userId != _user_id: return _load_error("WRONG_SCOPE")
	_state = decoded.state
	_ticket = queued.ticket.duplicate(true)
	clock.reset(int(queued.payload.elapsedMs))
	_screen = "play"
	_settlement_pending = true
	if session.metadata().get("settlementPending", false) and session.metadata().ticket.id == _ticket.id:
		_queue.configure(_store, session)
	var accepted: Dictionary = _queue.retry(_service, _user_id)
	if not accepted.ok: return _settlement_error(accepted.code, false)
	return _accepted_terminal(false)

func _accepted_terminal(defer_panel: bool) -> Dictionary:
	_settlement_pending = false
	_error = ""
	if not _refresh().ok: return _load_error(_error)
	var kind := "TUTORIAL_WIN" if _state.board.status == "WON" and _ticket.mode == "tutorial" else ("WIN" if _state.board.status == "WON" else "LOSE")
	_panel(kind, {"saved": true, "elapsedMs": clock.elapsed_ms()}, ["next-daily"] if kind == "TUTORIAL_WIN" else (["restart", "return-home"] if kind == "LOSE" else ["return-home"]), defer_panel)
	changed.emit()
	return _ok("SETTLED")

func _settlement_error(code: String, defer_panel: bool) -> Dictionary:
	_settlement_pending = true
	_error = code
	_panel("EXPIRED" if code == "CYCLE_EXPIRED" else "SETTLEMENT_ERROR", {"saved": false, "error": code}, ["expired-home"] if code == "CYCLE_EXPIRED" else ["retry-settlement"], defer_panel)
	changed.emit()
	return {"ok": false, "code": code}

func _discard_expired() -> Dictionary:
	# Check before any flush or cleanup write, including outbox-only recovery.
	# Reuse this decision time if the wall clock changes during those writes.
	var expiry_wall: int = int(_wall_now.call())
	var meta: Dictionary = session.metadata()
	var ticket: Dictionary = meta.get("ticket", _ticket)
	if ticket.is_empty(): return _fail("INVALID_TICKET")
	if ticket.get("userId") != _user_id or meta.get("scope", _scope) != _scope:
		return _fail("WRONG_SCOPE")
	if expiry_wall < int(ticket.expiresAt):
		var live: Dictionary = session.snapshot()
		if live.get("pending") != null and live.pending.phase == "EARNED":
			_settlement_pending = false
			_show("RECOVERY", {"pending": live.pending, "simulation": true}, ["recover-grant"])
		elif not _queue.pending().is_empty() or meta.get("settlementPending", false):
			_settlement_pending = true
			_show("SETTLEMENT_ERROR", {"saved": false, "error": "TICKET_NOT_EXPIRED"}, ["retry-settlement"])
		else:
			_show("LOAD_ERROR", {"error": "TICKET_NOT_EXPIRED"}, ["retry-load"])
		return _fail("TICKET_NOT_EXPIRED")
	_settlement_pending = true
	if session.is_dirty():
		var persisted: Dictionary = session.flush()
		if not persisted.ok: return _fail(persisted.code)
	var installed: bool = session.metadata().get("settlementPending", false)
	var cleared: Dictionary = session.clear_after_settlement() if installed else _store.write("active", "")
	if not cleared.ok: return _fail(cleared.code)
	var outbox: Dictionary = _store.write("outbox", "")
	if not outbox.ok: return _fail(outbox.code)
	if session.metadata().has("ticket"):
		var reset: Dictionary = session.finish_expired_cleanup(expiry_wall)
		if not reset.ok: return _fail(reset.code)
	_queue.configure(_store)
	_settlement_pending = false
	clock.stop()
	_state = {}
	_ticket = {}
	_error = ""
	_modal = {}
	_panel_pending = {}
	_screen = "home"
	_refresh()
	changed.emit()
	return _ok("EXPIRED_DISCARDED")

func _social_action(type: String, payload: Dictionary) -> Dictionary:
	var result: Dictionary = _service.request(_user_id, type, payload)
	if not result.ok: return _fail(result.code)
	_info = result.data
	changed.emit()
	return result

func _refresh() -> Dictionary:
	var result: Dictionary = _service.request(_user_id, "bootstrap", {})
	if result.ok: _info = result.data
	else: _error = result.code
	return result

func _show(kind: String, model: Dictionary, actions: Array) -> void:
	_modal = {"kind": kind, "model": model.duplicate(true), "actions": actions.duplicate()}
	session.set_paused("modal", true)

func _panel(kind: String, model: Dictionary, actions: Array, defer_panel: bool) -> void:
	var completed: bool = _completed_presentation.get("roundId") == _state.get("roundId") and _completed_presentation.get("revision") == _state.get("revision")
	if defer_panel and not completed:
		_panel_pending = {"kind": kind, "model": model.duplicate(true), "actions": actions.duplicate(), "roundId": _state.roundId, "revision": _state.revision}
	else:
		_show(kind, model, actions)

func _board_input() -> bool:
	return _initialized and _screen == "play" and _visible and not _presentation_locked and _modal.is_empty() and _panel_pending.is_empty() and not _settlement_pending

func _load_error(code: String) -> Dictionary:
	_error = code
	_show("LOAD_ERROR", {"error": code}, ["retry-load"])
	changed.emit()
	return {"ok": false, "code": code}

func _fail(code: String) -> Dictionary:
	_notice = code
	changed.emit()
	return {"ok": false, "code": code}

func _ok(code: String) -> Dictionary:
	return {"ok": true, "code": code}

func _valid_id(id: String) -> bool:
	if id.is_empty() or id.length() > 80 or id in ["__proto__", "constructor", "prototype"]: return false
	for ch in id:
		if ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-": return false
	return true
