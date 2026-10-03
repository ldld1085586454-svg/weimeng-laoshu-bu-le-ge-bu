extends RefCounted

const Board = preload("res://rules/board_reducer.gd")
const Canonical = preload("res://rules/canonical_json.gd")
const VERSION := "full-round-v012"
const LIMITS := {"move": 1, "undo": 1, "shuffle": 1, "revive": 1}
const COMMAND_KEYS := {
	"PICK": ["tileId"], "OFFER": ["assist", "channel", "permutation"],
	"LAUNCH": ["token"], "SHARE_HIDE": ["token"], "SHARE_RETURN": ["token"],
	"AD_CLOSE": ["token", "isEnded"], "FAIL": ["token"], "CANCEL": ["token"],
	"COMMIT": ["token"], "APPLY_FAILED": ["token"], "INTERRUPT": ["token"]}

static func _name(value: Variant) -> bool:
	if not value is String or value.to_utf16_buffer().size() > 320:
		return false
	# ECMAScript trim whitespace, including NBSP/BOM absent from strip_edges.
	for i in range(value.length()):
		var code: int = value.unicode_at(i)
		if not (code in [9, 10, 11, 12, 13, 32, 160, 5760, 8232, 8233, 8239, 8287, 12288, 65279] or (code >= 8192 and code <= 8202)):
			return true
	return false

static func create(deal: Dictionary, round_id: String) -> Dictionary:
	if not _name(round_id):
		return {"ok": false, "code": "ROUND_ID_REQUIRED"}
	var board: Dictionary = Board.create(deal, round_id)
	if board.has("ok") and not board.ok:
		return board
	return {"version": VERSION, "roundId": round_id, "initialDeal": board.deal,
		"board": board, "revision": 0, "used": {"move": 0, "undo": 0, "shuffle": 0, "revive": 0},
		"pending": null, "resolved": {}, "receipts": {}, "commands": [],
		"events": [{"id": round_id + ":e0", "type": "ROUND_STARTED", "roundId": round_id}], "unresumed": []}

static func _valid(command: Dictionary) -> bool:
	if not _name(command.get("id")) or not _name(command.get("roundId")):
		return false
	var revision: Variant = command.get("expectedRevision")
	if not (revision is int or revision is float) or not is_finite(float(revision)) or float(revision) != floor(float(revision)) or revision < 0 or revision > 9007199254740991:
		return false
	var type: Variant = command.get("type")
	if not type is String or not COMMAND_KEYS.has(type):
		return false
	var keys: Array = ["id", "roundId", "expectedRevision", "type"] + COMMAND_KEYS[type]
	for key in command:
		if not key in keys:
			return false
	if type == "PICK" and (not command.get("tileId") is String or command.tileId.is_empty()):
		return false
	if type != "PICK" and type != "OFFER" and not _name(command.get("token")):
		return false
	if type == "AD_CLOSE" and command.has("isEnded") and not command.isEnded is bool:
		return false
	return true

static func check_offer(state: Dictionary, assist: Variant, channel: Variant) -> String:
	if not assist is String or not LIMITS.has(assist):
		return "UNKNOWN_ASSIST"
	if not channel in ["video", "share"]:
		return "UNKNOWN_CHANNEL"
	if state.pending != null:
		return "REWARD_PENDING"
	if state.used[assist] >= LIMITS[assist]:
		return "ASSIST_EXHAUSTED"
	return Board.eligible(state.board, assist)

static func _reject(state: Dictionary, code: String) -> Dictionary:
	return {"ok": false, "code": code, "state": state, "events": [], "replayed": false}

static func _emit(state: Dictionary, events: Array, type: String, data: Dictionary = {}) -> void:
	var event := {"id": state.roundId + ":e" + str(state.events.size() + events.size()), "type": type, "roundId": state.roundId}
	event.merge(data, true)
	events.append(event)

static func _close(state: Dictionary, events: Array, status: String, event_type: String) -> void:
	var pending: Dictionary = state.pending
	state.resolved = state.resolved.duplicate()
	state.resolved[pending.token] = {"status": status, "assist": pending.assist, "channel": pending.channel}
	_emit(state, events, event_type, {"token": pending.token, "assist": pending.assist, "channel": pending.channel})
	state.pending = null

static func dispatch(source: Dictionary, input: Dictionary) -> Dictionary:
	if not _valid(input):
		return _reject(source, "INVALID_COMMAND")
	var command := input.duplicate(true)
	var signature: String = Canonical.encode(command)
	if command.roundId != source.roundId:
		return _reject(source, "WRONG_ROUND")
	if source.receipts.has(command.id):
		var receipt: Dictionary = source.receipts[command.id]
		if receipt.signature == signature:
			return {"ok": true, "code": receipt.code, "state": source, "events": [], "replayed": true}
		return _reject(source, "COMMAND_ID_CONFLICT")
	if command.expectedRevision != source.revision:
		return _reject(source, "STALE_REVISION")
	if source.commands.size() >= 10000:
		return _reject(source, "COMMAND_LIMIT")
	var state := source.duplicate(false)
	var events: Array = []
	var code := ""
	if command.type == "PICK":
		if state.pending != null:
			return _reject(source, "REWARD_PENDING")
		var picked: Dictionary = Board.pick(state.board, command.tileId)
		if not picked.ok:
			return _reject(source, picked.code)
		state.board = picked.state
		code = "PICKED"
		for event in picked.events:
			_emit(state, events, event.type, event)
		for token in state.unresumed:
			_emit(state, events, "PLAY_RESUMED_AFTER_GRANT", {"token": token})
		state.unresumed = []
	elif command.type == "OFFER":
		var reason := check_offer(state, command.get("assist"), command.get("channel"))
		if not reason.is_empty():
			return _reject(source, reason)
		if command.assist == "shuffle":
			if not command.get("permutation") is Array or command.permutation.size() > 3000:
				return _reject(source, "INVALID_SHUFFLE_PERMUTATION")
			var probe: Dictionary = Board.apply_assist(state.board, "shuffle", command.permutation)
			if not probe.ok:
				return _reject(source, probe.code)
		elif command.has("permutation"):
			return _reject(source, "UNEXPECTED_PERMUTATION")
		state.pending = {"token": Canonical.encode([VERSION, state.roundId, command.id, state.revision]).sha256_text(),
			"assist": command.assist, "channel": command.channel, "roundId": state.roundId,
			"boardRevision": state.board.revision, "phase": "OFFERED", "leftGame": false, "recoveryReason": null}
		if command.has("permutation"):
			state.pending.permutation = command.permutation.duplicate()
		_emit(state, events, "REWARD_OFFERED", {"token": state.pending.token, "assist": command.assist, "channel": command.channel})
		code = "OFFERED"
	else:
		if state.resolved.has(command.token):
			return _reject(source, "REWARD_ALREADY_RESOLVED")
		if state.pending == null:
			return _reject(source, "NO_PENDING_REWARD")
		if command.token != state.pending.token:
			return _reject(source, "WRONG_REWARD_TOKEN")
		if state.pending.roundId != state.roundId or state.pending.boardRevision != state.board.revision:
			return _reject(source, "REWARD_STATE_CHANGED")
		state.pending = state.pending.duplicate()
		var pending: Dictionary = state.pending
		if command.type == "LAUNCH":
			if pending.phase != "OFFERED":
				return _reject(source, "INVALID_TRANSITION")
			pending.phase = "WAITING"
			code = "WAITING"
			_emit(state, events, "SHARE_INITIATED" if pending.channel == "share" else "VIDEO_REQUESTED", {"token": pending.token})
		elif command.type == "SHARE_HIDE":
			if pending.phase != "WAITING" or pending.channel != "share":
				return _reject(source, "INVALID_TRANSITION")
			pending.leftGame = true
			code = "SHARE_LEFT"
			_emit(state, events, "SHARE_LEFT_GAME", {"token": pending.token})
		elif command.type == "SHARE_RETURN":
			if pending.phase != "WAITING" or pending.channel != "share" or not pending.leftGame:
				return _reject(source, "SHARE_RETURN_NOT_QUALIFIED")
			pending.phase = "EARNED"
			code = "EARNED"
			_emit(state, events, "SHARE_RETURN_UNVERIFIED", {"token": pending.token, "assist": pending.assist})
			_emit(state, events, "ENTITLEMENT_EARNED", {"token": pending.token, "source": "accepted-return-candidate", "verifiedSend": false})
		elif command.type == "AD_CLOSE":
			if pending.phase != "WAITING" or pending.channel != "video":
				return _reject(source, "INVALID_TRANSITION")
			if command.get("isEnded") == true:
				pending.phase = "EARNED"
				code = "EARNED"
				_emit(state, events, "VIDEO_COMPLETE_OBSERVED", {"token": pending.token})
				_emit(state, events, "ENTITLEMENT_EARNED", {"token": pending.token, "source": "client-completion-observation"})
			else:
				code = "VIDEO_INCOMPLETE" if command.get("isEnded") == false else "VIDEO_UNVERIFIED"
				_close(state, events, code, code)
		elif command.type == "COMMIT":
			if pending.phase != "EARNED":
				return _reject(source, "REWARD_NOT_EARNED")
			if state.used[pending.assist] >= LIMITS[pending.assist]:
				return _reject(source, "ASSIST_EXHAUSTED")
			var applied: Dictionary = Board.apply_assist(state.board, pending.assist, pending.get("permutation", []))
			if not applied.ok:
				return _reject(source, applied.code)
			state.board = applied.state
			state.used = state.used.duplicate()
			state.used[pending.assist] += 1
			for event in applied.events:
				_emit(state, events, event.type, event)
			state.unresumed = state.unresumed + [pending.token]
			_close(state, events, "APPLIED", "GRANT_APPLIED")
			code = "APPLIED"
		elif command.type == "APPLY_FAILED":
			if pending.phase != "EARNED":
				return _reject(source, "REWARD_NOT_EARNED")
			pending.recoveryReason = "APPLY_OR_STORAGE_FAILED"
			code = "RECOVERY_REQUIRED"
			_emit(state, events, "GRANT_RETRY_REQUIRED", {"token": pending.token})
		elif command.type in ["FAIL", "CANCEL", "INTERRUPT"]:
			if pending.phase == "EARNED":
				return _reject(source, "EARNED_REWARD_MUST_BE_RECOVERED")
			code = {"FAIL": "REQUEST_FAILED", "CANCEL": "CANCELLED", "INTERRUPT": "INTERRUPTED_UNVERIFIED"}[command.type]
			_close(state, events, code, code)
		else:
			return _reject(source, "INVALID_TRANSITION")
	var checked: Dictionary = Board.check_invariants(state.board)
	assert(checked.ok, "Board invariant: " + checked.code)
	state.receipts = state.receipts.duplicate()
	state.receipts[command.id] = {"signature": signature, "code": code}
	state.revision += 1
	state.commands = state.commands + [command]
	state.events = state.events + events
	return {"ok": true, "code": code, "state": state, "events": events, "replayed": false}

static func fingerprint(state: Dictionary) -> String:
	var board: Dictionary = state.board
	return Canonical.encode([state.roundId, state.revision, state.used, state.pending, state.resolved, state.unresumed,
		board.deal.snapshotHash, board.taken, board.rack, board.buffer, board.status, board.revision,
		board.cleared, board.undo, board.get("reviveCandidate")]).sha256_text()

static func metrics(state: Dictionary) -> Dictionary:
	var counts := {}
	for event in state.events:
		counts[event.type] = counts.get(event.type, 0) + 1
	var result := {"roundId": state.roundId, "used": state.used.duplicate(), "platformRevenueCny": null, "verifiedShares": null}
	var names := {"offers": "REWARD_OFFERED", "videoRequests": "VIDEO_REQUESTED", "videoCompletions": "VIDEO_COMPLETE_OBSERVED",
		"shareInitiated": "SHARE_INITIATED", "shareReturnsUnverified": "SHARE_RETURN_UNVERIFIED", "grants": "GRANT_APPLIED",
		"continuedAfterGrant": "PLAY_RESUMED_AFTER_GRANT", "failures": "LOST", "wins": "WON"}
	for key in names:
		result[key] = counts.get(names[key], 0)
	return result
