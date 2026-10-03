extends RefCounted

const Round = preload("res://rules/round_reducer.gd")
var _session: RefCounted
var _ticket: Dictionary = {}
var _input_allowed: bool = true
var _random := RandomNumberGenerator.new()

func _init() -> void:
	_random.randomize()

func bind_session(session: RefCounted, ticket: Dictionary) -> void:
	_session = session
	_ticket = ticket.duplicate(true)

func set_input_allowed(value: bool) -> void:
	_input_allowed = value

func intent_pick(tile_id: String) -> Dictionary:
	if not _input_allowed or _session == null:
		return {"ok": false, "code": "UI_LOCKED"}
	return _session.send("PICK", {"tileId": tile_id, "roundId": _ticket.id})

func intent_assist(assist: String, channel: String = "video") -> Dictionary:
	if not _input_allowed or _session == null:
		return {"ok": false, "code": "UI_LOCKED"}
	var state: Dictionary = _session.snapshot()
	if state.is_empty():
		return {"ok": false, "code": "NO_SESSION"}
	var reason: String = Round.check_offer(state, assist, channel)
	if not reason.is_empty():
		return {"ok": false, "code": reason}
	var extra := {"assist": assist, "channel": channel, "roundId": _ticket.id}
	if assist == "shuffle":
		var permutation: Array = []
		for i in range(state.board.deal.cells.size()):
			if not state.board.taken[i]:
				permutation.append(state.board.deal.cells[i].type)
		for i in range(permutation.size() - 1, 0, -1):
			var j := _random.randi_range(0, i)
			var value: Variant = permutation[i]
			permutation[i] = permutation[j]
			permutation[j] = value
		extra.permutation = permutation
	return _session.send("OFFER", extra)

func assists() -> Dictionary:
	var state: Dictionary = _session.snapshot() if _session != null else {}
	var result := {}
	for assist in ["move", "undo", "shuffle", "revive"]:
		var reason: String = Round.check_offer(state, assist, "video") if not state.is_empty() else "NO_SESSION"
		result[assist] = {"enabled": reason.is_empty(), "remaining": 1 - int(state.used[assist]) if not state.is_empty() else 1, "reason": reason}
	return result
