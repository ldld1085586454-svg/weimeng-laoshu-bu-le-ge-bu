extends RefCounted

const Round = preload("res://rules/round_reducer.gd")
const Codec = preload("res://storage/round_codec.gd")

# The record must come from successful Codec replay. This policy never treats
# an unaccepted expired ticket as gameplay recovery. Terminal error records can
# still be submitted to the service's accepted-first lookup using their payload.
static func inspect(record: Dictionary, scope: String, now_ms: int) -> Dictionary:
	if record.is_empty():
		return _result("none", "NO_SAVE", record)
	if not record.get("state") is Dictionary or not record.get("meta") is Dictionary:
		return _result("error", "INVALID_RECOVERY_RECORD", record)
	var state: Dictionary = record.state
	var meta: Dictionary = record.meta
	if not state.get("board") is Dictionary or not Codec.valid_meta(meta, state.get("roundId", "")):
		return _result("error", "INVALID_RECOVERY_RECORD", record)
	if meta.scope != scope:
		return _result("error", "WRONG_SCOPE", record)
	var terminal: bool = state.pending == null and state.board.status in ["WON", "LOST"]
	if now_ms >= meta.ticket.expiresAt and not (terminal and meta.get("settlementAccepted", false)):
		return _result("error", "CYCLE_EXPIRED", record)
	if state.pending != null:
		if state.pending.phase == "EARNED":
			return _result("recover_earned", "EARNED_RECOVERY", record)
		var id := "recovery-interrupt-" + str(state.revision)
		while state.receipts.has(id):
			id += "x"
		var interrupted: Dictionary = Round.dispatch(state, {"id": id, "roundId": state.roundId,
			"expectedRevision": state.revision, "type": "INTERRUPT", "token": state.pending.token})
		if not interrupted.ok:
			return _result("error", interrupted.code, record)
		var cleaned := record.duplicate(true)
		cleaned.state = interrupted.state
		return _result("none", "INTERRUPTED_UNVERIFIED", cleaned)
	if terminal and (meta.settlementPending or state.board.status == "WON" or state.used.revive > 0):
		return _result("settle_terminal", "TERMINAL_RECOVERY", record)
	return _result("none", "NO_RECOVERY", record)

static func _result(action: String, code: String, record: Dictionary) -> Dictionary:
	return {"action": action, "code": code, "record": record.duplicate(true)}
