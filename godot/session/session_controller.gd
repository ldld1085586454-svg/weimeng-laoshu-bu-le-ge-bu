extends RefCounted

const Round = preload("res://rules/round_reducer.gd")
const Codec = preload("res://storage/round_codec.gd")
const Recovery = preload("res://session/recovery_policy.gd")

signal committed(before: Dictionary, after: Dictionary, events: Array)

var _state: Dictionary = {}
var _meta: Dictionary = {}
var _store: RefCounted
var _clock: RefCounted
var _dirty: bool = false
var _sequence: int = 0
var _active_cleared: bool = false
var _nonce: String = Crypto.new().generate_random_bytes(8).hex_encode()

func configure(deal: Dictionary, round_id: String, meta: Dictionary, store: RefCounted, clock: RefCounted) -> Dictionary:
	var gate := _replacement_gate()
	if not gate.is_empty():
		return {"ok": false, "code": gate}
	var candidate: Dictionary = Round.create(deal, round_id)
	if candidate.has("ok") and not candidate.ok:
		return {"ok": false, "code": candidate.code}
	var initial_meta := meta.duplicate(true)
	if not Codec.valid_meta(initial_meta, round_id) or initial_meta.settlementPending:
		return {"ok": false, "code": "INVALID_SAVE_META"}
	initial_meta.elapsedMs = 0
	var written := _write(candidate, initial_meta, store)
	if not written.ok:
		return written
	_install(candidate, initial_meta, store, clock, "new")
	return {"ok": true, "code": "CONFIGURED"}

func restore(text: String, expected_scope: String, wall_ms: int, store: RefCounted, clock: RefCounted) -> Dictionary:
	var gate := _replacement_gate()
	if not gate.is_empty():
		return {"ok": false, "code": gate, "action": "error"}
	var decoded: Dictionary = Codec.restore(text)
	if not decoded.ok:
		return {"ok": false, "code": decoded.code, "action": "error"}
	var decision: Dictionary = Recovery.inspect(decoded, expected_scope, wall_ms)
	if decision.action == "error":
		var result := {"ok": false, "code": decision.code, "action": "error"}
		# Acceptance can only be decided by the service. Expose the frozen
		# original terminal submission without installing an expired game.
		if decision.code == "CYCLE_EXPIRED" and _terminal(decoded.state):
			result.payload = _submission(decoded.state, decoded.meta)
			result.ticket = decoded.meta.ticket.duplicate(true)
		return result
	if decision.action == "none":
		if decision.code == "INTERRUPTED_UNVERIFIED":
			var saved := _write(decision.record.state, decision.record.meta, store)
			if not saved.ok:
				return {"ok": false, "code": saved.code, "action": "error"}
		return {"ok": true, "code": decision.code, "action": "none"}
	_install(decision.record.state, decision.record.meta, store, clock, decision.action)
	return {"ok": true, "code": decision.code, "action": decision.action}

func _install(state: Dictionary, meta: Dictionary, store: RefCounted, clock: RefCounted, action: String) -> void:
	if _clock != null:
		_clock.stop()
	_state = state.duplicate(true)
	_meta = meta.duplicate(true)
	_store = store
	_clock = clock
	_dirty = false
	_active_cleared = false
	_sequence = 0
	_nonce = Crypto.new().generate_random_bytes(8).hex_encode()
	_clock.reset(int(_meta.elapsedMs))
	if action != "settle_terminal":
		_clock.start()
		if action == "recover_earned" or _meta.get("modal", false):
			_clock.pause("modal")
		if _meta.get("hidden", false):
			_clock.pause("hidden")
		_sync_clock()

func send(type: String, extra: Dictionary = {}, observed: bool = false) -> Dictionary:
	if _state.is_empty():
		return {"ok": false, "code": "NO_SESSION"}
	if _meta.settlementPending:
		return {"ok": false, "code": "SETTLEMENT_PENDING"}
	if _dirty and not observed and not flush().ok:
		return {"ok": false, "code": "STORAGE_WRITE_FAILED"}
	_sequence += 1
	var command := {"type": type, "id": "p-" + _nonce + "-" + str(_sequence), "roundId": _state.roundId, "expectedRevision": _state.revision}
	command.merge(extra, true)
	var reduced: Dictionary = Round.dispatch(_state, command)
	if not reduced.ok:
		return {"ok": false, "code": reduced.code}
	if reduced.replayed:
		return {"ok": true, "code": reduced.code, "saved": not _dirty, "events": [], "replayed": true}
	_clock.pause("persistence")
	var next_meta := _current_meta()
	var written := _write(reduced.state, next_meta, _store)
	if not written.ok and not observed:
		_clock.resume("persistence")
		return written
	var before := _state.duplicate(true)
	_state = reduced.state.duplicate(true)
	_meta = next_meta
	_dirty = not written.ok
	_sync_clock()
	_clock.resume("persistence")
	committed.emit(before, _state.duplicate(true), reduced.events.duplicate(true))
	return {"ok": true, "code": reduced.code, "saved": written.ok, "events": reduced.events.duplicate(true), "replayed": false}

func flush() -> Dictionary:
	if _active_cleared:
		return {"ok": false, "code": "ACTIVE_CLEARED"}
	if _state.is_empty():
		return {"ok": false, "code": "NO_SESSION"}
	_clock.pause("persistence")
	var next_meta := _current_meta()
	var written := _write(_state, next_meta, _store)
	_clock.resume("persistence")
	_dirty = not written.ok
	if written.ok:
		_meta = next_meta
	return {"ok": written.ok, "code": "SAVED" if written.ok else written.code}

func snapshot() -> Dictionary:
	return _state.duplicate(true)

func _replacement_gate() -> String:
	if _meta.get("settlementPending", false):
		return "SETTLEMENT_PENDING"
	if _state.get("pending") != null and _state.pending.phase == "EARNED":
		return "EARNED_REWARD_MUST_BE_RECOVERED"
	if _dirty:
		return "DIRTY_EVIDENCE"
	if _state.get("pending") != null:
		return "REWARD_PENDING"
	return ""

func metadata() -> Dictionary:
	return _meta.duplicate(true)

func is_dirty() -> bool:
	return _dirty

func set_paused(reason: String, paused: bool) -> void:
	if _clock == null:
		return
	if paused:
		_clock.pause(reason)
	else:
		_clock.resume(reason)
	if reason in ["modal", "hidden"]:
		_meta[reason] = paused

# A confirmed first loss is a product decision, rather than a reducer command.
# Persist this decision and exact payload before the separate outbox write.
func prepare_terminal() -> Dictionary:
	if _state.is_empty() or not _terminal(_state):
		return {"ok": false, "code": "ROUND_NOT_TERMINAL"}
	if _dirty and not flush().ok:
		return {"ok": false, "code": "STORAGE_WRITE_FAILED"}
	if _meta.has("settlementPayload"):
		return {"ok": true, "code": "PREPARED", "payload": _meta.settlementPayload.duplicate(true)}
	_clock.stop()
	var next_meta := _current_meta()
	next_meta.settlementPending = true
	next_meta.settlementAccepted = false
	var payload := _submission(_state, next_meta)
	if payload.log.is_empty():
		return {"ok": false, "code": "SAVE_TOO_LARGE"}
	next_meta.settlementPayload = payload
	var written := _write(_state, next_meta, _store)
	if not written.ok:
		return written
	_meta = next_meta
	return {"ok": true, "code": "PREPARED", "payload": payload.duplicate(true)}

# Service acceptance alone does not clear pending; cleanup owns that gate.
func mark_settlement_accepted() -> Dictionary:
	if _active_cleared:
		return {"ok": true, "code": "ALREADY_ACCEPTED"} if _meta.get("settlementAccepted", false) else {"ok": false, "code": "ACTIVE_CLEARED"}
	if not _meta.has("settlementPayload"):
		return {"ok": false, "code": "SETTLEMENT_NOT_PREPARED"}
	var next_meta := _meta.duplicate(true)
	next_meta.settlementAccepted = true
	var written := _write(_state, next_meta, _store)
	if written.ok:
		_meta = next_meta
	return written

# Queue clears active first, then outbox. Preserve the in-memory pending gate
# until the queue confirms that the second durable cleanup write succeeded.
func clear_after_settlement() -> Dictionary:
	if not _meta.get("settlementPending", false):
		return {"ok": false, "code": "SETTLEMENT_NOT_PREPARED"}
	var written: Dictionary = _store.write("active", "")
	if written.get("ok", false):
		_active_cleared = true
	return {"ok": bool(written.get("ok", false)), "code": "CLEARED" if written.get("ok", false) else "STORAGE_WRITE_FAILED"}

func finish_settlement_cleanup() -> Dictionary:
	if not _active_cleared:
		return {"ok": false, "code": "ACTIVE_NOT_CLEARED"}
	_clock.stop()
	_state = {}
	_meta = {}
	_dirty = false
	_active_cleared = false
	return {"ok": true, "code": "CLEARED"}

# Explicit expiry abandonment is distinct from settlement acknowledgement.
# Router first persists evidence and clears both records; this method verifies
# those boundaries and resets this object without losing signal subscribers.
func finish_expired_cleanup(wall_ms: int) -> Dictionary:
	if not _meta.get("ticket") is Dictionary:
		return {"ok": false, "code": "NO_SESSION"}
	if wall_ms < _meta.ticket.expiresAt:
		return {"ok": false, "code": "TICKET_NOT_EXPIRED"}
	if _dirty:
		return {"ok": false, "code": "DIRTY_EVIDENCE"}
	for key in ["active", "outbox"]:
		var record: Dictionary = _store.read(key)
		if not record.get("ok", false) or record.get("text", "not empty") != "":
			return {"ok": false, "code": "CLEANUP_NOT_COMPLETE"}
	_clock.reset()
	_state = {}
	_meta = {}
	_dirty = false
	_active_cleared = false
	return {"ok": true, "code": "CLEARED"}

func _current_meta() -> Dictionary:
	var result := _meta.duplicate(true)
	if not result.has("settlementPayload"):
		result.elapsedMs = _clock.elapsed_ms()
	return result

static func _submission(state: Dictionary, meta: Dictionary) -> Dictionary:
	if meta.has("settlementPayload"):
		return meta.settlementPayload.duplicate(true)
	var frozen := meta.duplicate(true)
	frozen.settlementPending = true
	frozen.settlementAccepted = false
	return {"ticketId": state.roundId, "log": Codec.encode(state, frozen), "elapsedMs": frozen.elapsedMs}

static func _terminal(state: Dictionary) -> bool:
	return state.pending == null and state.board.status in ["WON", "LOST"]

func _sync_clock() -> void:
	if _state.board.status == "WON" or (_state.board.status == "LOST" and (_meta.settlementPending or _state.used.revive > 0) and _state.pending == null):
		_clock.stop()
	elif _state.board.status == "LOST":
		_clock.pause("lost")
	else:
		_clock.resume("lost")
	if _state.pending != null:
		_clock.pause("reward")
	else:
		_clock.resume("reward")

static func _write(state: Dictionary, meta: Dictionary, store: RefCounted) -> Dictionary:
	var text := Codec.encode(state, meta)
	if text.is_empty():
		return {"ok": false, "code": "INVALID_SAVE_META" if not Codec.valid_meta(meta, state.roundId) else "SAVE_TOO_LARGE"}
	if store == null or not store.has_method("write"):
		return {"ok": false, "code": "STORAGE_WRITE_FAILED"}
	var written: Dictionary = store.write("active", text)
	return {"ok": bool(written.get("ok", false)), "code": "SAVED" if written.get("ok", false) else "STORAGE_WRITE_FAILED"}
