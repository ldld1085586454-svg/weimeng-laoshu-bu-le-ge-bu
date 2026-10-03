extends RefCounted

const Round = preload("res://rules/round_reducer.gd")
const Canonical = preload("res://rules/canonical_json.gd")
const SCHEMA := "godot-round-v1"
const MAX_BYTES := 8 * 1024 * 1024
const PAYLOAD_KEYS := ["schema", "version", "roundId", "initialDeal", "commands", "fingerprint", "meta"]

static func encode(state: Dictionary, meta: Dictionary) -> String:
	if not valid_meta(meta, state.get("roundId", "")):
		return ""
	var payload := {"schema": SCHEMA, "version": Round.VERSION, "roundId": state.roundId,
		"initialDeal": state.initialDeal, "commands": state.commands, "fingerprint": Round.fingerprint(state), "meta": meta}
	var text := Canonical.encode({"payload": payload, "checksum": Canonical.encode(payload).sha256_text()})
	return text if text.to_utf8_buffer().size() <= MAX_BYTES else ""

static func restore(text: String) -> Dictionary:
	return _restore(text, true)

static func _error(code: String) -> Dictionary:
	return {"ok": false, "code": code, "state": {}, "meta": {}}

static func _keys(value: Dictionary, expected: Array) -> bool:
	if value.size() != expected.size():
		return false
	for key in expected:
		if not value.has(key):
			return false
	return true

static func _restore(text: String, allow_submission: bool) -> Dictionary:
	if text.to_utf8_buffer().size() > MAX_BYTES:
		return _error("SAVE_TOO_LARGE")
	var parser := JSON.new()
	if parser.parse(text) != OK or not parser.data is Dictionary:
		return _error("INVALID_SAVE")
	var envelope: Dictionary = parser.data
	if not _keys(envelope, ["payload", "checksum"]) or not envelope.payload is Dictionary or not envelope.checksum is String:
		return _error("INVALID_SAVE")
	var payload: Dictionary = envelope.payload
	if Canonical.encode(payload).sha256_text() != envelope.checksum:
		return _error("SAVE_CHECKSUM_MISMATCH")
	if not _keys(payload, PAYLOAD_KEYS):
		return _error("INVALID_SAVE")
	if payload.schema != SCHEMA or payload.version != Round.VERSION or not payload.commands is Array or payload.commands.size() > 10000:
		return _error("INVALID_SAVE_VERSION")
	if not payload.roundId is String or not payload.initialDeal is Dictionary or not payload.fingerprint is String or not payload.meta is Dictionary:
		return _error("INVALID_SAVE")
	if not valid_meta(payload.meta, payload.roundId) or (not allow_submission and payload.meta.has("settlementPayload")):
		return _error("INVALID_SAVE_META")
	var state: Dictionary = Round.create(payload.initialDeal, payload.roundId)
	if state.has("ok") and not state.ok:
		return _error("SAVE_REPLAY_REJECTED:" + state.code)
	for command in payload.commands:
		if not command is Dictionary:
			return _error("SAVE_REPLAY_REJECTED:INVALID_COMMAND")
		var result: Dictionary = Round.dispatch(state, command)
		if not result.ok or result.replayed:
			return _error("SAVE_REPLAY_REJECTED:" + result.code)
		state = result.state
	if Round.fingerprint(state) != payload.fingerprint:
		return _error("SAVE_STATE_MISMATCH")
	if payload.meta.has("settlementPayload"):
		var submission: Dictionary = payload.meta.settlementPayload
		var inner: Dictionary = _restore(submission.log, false)
		if not inner.ok or Canonical.encode(inner.state) != Canonical.encode(state) or inner.meta.scope != payload.meta.scope or Canonical.encode(inner.meta.ticket) != Canonical.encode(payload.meta.ticket) or inner.meta.elapsedMs != payload.meta.elapsedMs or not inner.meta.settlementPending:
			return _error("INVALID_SETTLEMENT_PAYLOAD")
	return {"ok": true, "code": "RESTORED", "state": state, "meta": payload.meta.duplicate(true)}

static func _safe_duration(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= 0 and value <= 9007199254740991 and value == floor(float(value))

static func valid_meta(meta: Dictionary, round_id: String) -> bool:
	if not meta.get("scope") is String or meta.scope.strip_edges().is_empty() or not meta.get("ticket") is Dictionary:
		return false
	if meta.ticket.get("id") != round_id or round_id.is_empty() or not _safe_duration(meta.ticket.get("expiresAt")):
		return false
	if not _safe_duration(meta.get("elapsedMs")) or not meta.get("settlementPending") is bool:
		return false
	for key in ["settlementAccepted", "hidden", "modal"]:
		if meta.has(key) and not meta[key] is bool:
			return false
	if meta.get("settlementAccepted", false) and not meta.settlementPending:
		return false
	if meta.has("settlementPayload"):
		var submission: Variant = meta.settlementPayload
		if not submission is Dictionary or not _keys(submission, ["ticketId", "log", "elapsedMs"]) or not submission.get("log") is String or submission.ticketId != round_id or not _safe_duration(submission.elapsedMs) or submission.elapsedMs != meta.elapsedMs or not meta.settlementPending:
			return false
	return true
