extends RefCounted

const Loader = preload("res://rules/deal_loader.gd")
const Graph = preload("res://rules/blocker_graph.gd")
const Canonical = preload("res://rules/canonical_json.gd")
const REVIVE_CANDIDATE := "research-revive-append-three-v011"

# Invalid initial deals return an error dictionary; accepted deals return the
# source-compatible board itself. Round/session owners supply a nonempty ID.
static func create(deal: Dictionary, round_id: String) -> Dictionary:
	var loaded := Loader.validate_deal(deal)
	if not loaded.ok:
		return {"ok": false, "code": loaded.code}
	if round_id.strip_edges().is_empty():
		return {"ok": false, "code": "INVALID_ROUND_ID"}
	var immutable: Dictionary = loaded.deal
	if not immutable.has("snapshotHash"):
		immutable.snapshotHash = Canonical.snapshot_hash(immutable)
	var graph := Graph.build(immutable)
	var taken: Array = []
	var blockers: Array = []
	for parents in graph.parents:
		taken.append(false)
		blockers.append(parents.size())
	return {"deal": immutable, "graph": {"parents": graph.parents, "children": graph.children},
		"byId": graph.by_id, "taken": taken, "blockers": blockers, "rack": [], "cleared": 0,
		"status": "PLAYING", "revision": 0, "shuffleOrdinal": 0, "originalDealId": deal.dealId,
		"roundId": round_id, "buffer": [], "undo": null}

static func legal_tiles(board: Dictionary) -> Array[String]:
	var ids: Array[String] = []
	if board.status != "PLAYING":
		return ids
	for i in range(board.deal.cells.size()):
		if not board.taken[i] and board.blockers[i] == 0:
			ids.append(board.deal.cells[i].id)
	ids.sort_custom(_id_less)
	for id in board.buffer:
		ids.append(id)
	return ids

# Array.sort in the JS runtime compares UTF-16 code units. Godot's default
# string ordering uses Unicode code points, which differs for astral IDs.
static func _id_less(left: String, right: String) -> bool:
	var a := left.to_utf16_buffer()
	var b := right.to_utf16_buffer()
	for i in range(0, mini(a.size(), b.size()), 2):
		var x := a.decode_u16(i)
		var y := b.decode_u16(i)
		if x != y:
			return x < y
	return a.size() < b.size()

static func rejected(board: Dictionary, code: String) -> Dictionary:
	return {"ok": false, "code": code, "state": board, "events": []}

static func status_of(board: Dictionary) -> String:
	if board.rack.size() >= 7:
		return "LOST"
	if board.cleared == board.deal.cells.size() and board.rack.is_empty() and board.buffer.is_empty():
		return "WON"
	return "PLAYING"

static func tile_type(board: Dictionary, id: String) -> String:
	return board.deal.cells[board.byId[id]].type

static func accepted(state: Dictionary, code: String, events: Array) -> Dictionary:
	var checked := check_invariants(state)
	assert(checked.ok, "Board invariant: " + checked.code)
	return {"ok": true, "code": code, "state": state, "events": events}

static func pick(board: Dictionary, tile_id: String) -> Dictionary:
	if board.status != "PLAYING":
		return rejected(board, "ROUND_NOT_PLAYING")
	if not board.byId.has(tile_id):
		return rejected(board, "UNKNOWN_TILE")
	var index: int = board.byId[tile_id]
	var buffer_index: int = board.buffer.find(tile_id)
	var from_buffer := buffer_index >= 0
	if not from_buffer and board.taken[index]:
		return rejected(board, "ALREADY_TAKEN")
	if not from_buffer and board.blockers[index] != 0:
		return rejected(board, "BLOCKED")
	# Every modified container is copied, leaving prior states replayable.
	var state := board.duplicate(false)
	state.taken = board.taken.duplicate()
	state.blockers = board.blockers.duplicate()
	state.buffer = board.buffer.duplicate()
	state.rack = board.rack.duplicate()
	if from_buffer:
		state.buffer.remove_at(buffer_index)
	else:
		state.taken[index] = true
		for child in board.graph.children[index]:
			if not state.taken[child]:
				state.blockers[child] -= 1
	var type: String = board.deal.cells[index].type
	var at := -1
	for j in range(state.rack.size()):
		if tile_type(board, state.rack[j]) == type:
			at = j
	state.rack.insert(state.rack.size() if at < 0 else at + 1, tile_id)
	var matching: Array = []
	for id in state.rack:
		if tile_type(board, id) == type:
			matching.append(id)
	var clear: Array = matching if matching.size() == 3 else []
	for id in clear:
		state.rack.erase(id)
	state.cleared = board.cleared + clear.size()
	state.revision = board.revision + 1
	var source: String = "buffer" if from_buffer else board.deal.cells[index].zone
	state.undo = null if not clear.is_empty() else {"id": tile_id, "source": source}
	state.status = status_of(state)
	var events: Array = [{"type": "TAKE", "id": tile_id, "source": source}]
	if not clear.is_empty():
		events.append({"type": "CLEAR", "ids": clear})
	if state.status != "PLAYING":
		events.append({"type": state.status})
	return accepted(state, "PICKED", events)

# Empty string represents JS null eligibility; quotas belong to RoundReducer.
static func eligible(board: Dictionary, assist: String) -> String:
	if assist == "revive":
		if board.status != "LOST":
			return "REVIVE_REQUIRES_LOST"
		if board.rack.size() != 7 or board.buffer.size() > 3:
			return "REVIVE_SHAPE_UNSUPPORTED"
		return ""
	if not assist in ["move", "undo", "shuffle"]:
		return "UNKNOWN_ASSIST"
	if board.status != "PLAYING":
		return "ROUND_NOT_PLAYING"
	if assist == "move":
		if board.rack.size() < 3:
			return "NOT_ENOUGH_RACK_TILES"
		if not board.buffer.is_empty():
			return "BUFFER_OCCUPIED"
	if assist == "undo":
		if board.undo == null or not board.undo.id in board.rack:
			return "NO_UNDO"
		if board.undo.source != "board":
			return "UNDO_SOURCE_UNBOUND"
	if assist == "shuffle" and not false in board.taken:
		return "NO_REMAINING_TILES"
	return ""

static func apply_assist(board: Dictionary, assist: String, permutation: Array = []) -> Dictionary:
	var reason := eligible(board, assist)
	if not reason.is_empty():
		return rejected(board, reason)
	var state := board.duplicate(false)
	var events: Array = []
	var code := "ASSIST_APPLIED"
	if assist == "move" or assist == "revive":
		var ids: Array = board.rack.slice(0, 3)
		state.rack = board.rack.slice(3)
		state.buffer = ids if assist == "move" else board.buffer + ids
		if assist == "move":
			events.append({"type": "MOVE_TO_BUFFER", "ids": ids})
		else:
			state.reviveCandidate = REVIVE_CANDIDATE
			state.revivalApplied = true
			code = "REVIVED_CANDIDATE"
			events.append({"type": "REVIVE_CANDIDATE_APPLIED", "ids": ids, "candidate": REVIVE_CANDIDATE})
	elif assist == "undo":
		var id: String = board.undo.id
		state.taken = board.taken.duplicate()
		state.taken[board.byId[id]] = false
		state.blockers = []
		for parents in board.graph.parents:
			var count := 0
			for parent in parents:
				if not state.taken[parent]:
					count += 1
			state.blockers.append(count)
		state.rack = board.rack.duplicate()
		state.rack.erase(id)
		events.append({"type": "UNDO", "id": id})
	else:
		var remaining: Array = []
		var counts := {}
		for i in range(board.taken.size()):
			if not board.taken[i]:
				remaining.append(i)
				var type: String = board.deal.cells[i].type
				counts[type] = counts.get(type, 0) + 1
		if permutation.size() != remaining.size():
			return rejected(board, "INVALID_SHUFFLE_PERMUTATION")
		for type in permutation:
			if not type is String or counts.get(type, 0) <= 0:
				return rejected(board, "INVALID_SHUFFLE_PERMUTATION")
			counts[type] -= 1
		state.deal = board.deal.duplicate(true)
		for i in range(remaining.size()):
			state.deal.cells[remaining[i]].type = permutation[i]
		state.shuffleOrdinal = board.shuffleOrdinal + 1
		state.deal.snapshotHash = Canonical.snapshot_hash(state.deal)
		state.deal.dealId = board.originalDealId + "#shuffle-" + str(state.shuffleOrdinal) + "-" + state.deal.snapshotHash
		events.append({"type": "SHUFFLED", "snapshotHash": state.deal.snapshotHash, "ordinal": state.shuffleOrdinal})
	state.undo = null
	state.revision = board.revision + 1
	state.status = status_of(state)
	return accepted(state, code, events)

static func invariant_error(code: String) -> Dictionary:
	return {"ok": false, "code": code}

# Mirrors source checkRound. Loaded deals/graphs are trusted inputs here; saved
# rounds are reconstructed through validated command replay rather than snapshots.
static func check_invariants(board: Dictionary) -> Dictionary:
	var cells: Array = board.deal.cells
	var n := cells.size()
	if not board.taken is Array or not board.blockers is Array or board.taken.size() != n or board.blockers.size() != n:
		return invariant_error("INVALID_TAKEN_MASK")
	for value in board.taken:
		if not value is bool:
			return invariant_error("INVALID_TAKEN_MASK")
	if not Graph.integer(board.cleared) or board.cleared < 0 or int(board.cleared) % 3 != 0:
		return invariant_error("INVALID_CLEARED_COUNT")
	var buffer_cap := 6 if board.get("reviveCandidate") == REVIVE_CANDIDATE and board.get("revivalApplied") == true else 3
	if not board.buffer is Array or board.buffer.size() > buffer_cap:
		return invariant_error("INVALID_BUFFER")
	var seen := {}
	for id in board.rack + board.buffer:
		if not board.byId.has(id) or seen.has(id) or not board.taken[board.byId[id]]:
			return invariant_error("DUPLICATE_OR_MISPLACED_TILE")
		seen[id] = true
	var taken_count := 0
	for taken in board.taken:
		if taken:
			taken_count += 1
	if taken_count != board.cleared + seen.size():
		return invariant_error("CARD_CONSERVATION")
	var cleared_types := {}
	for i in range(n):
		var count := 0
		for parent in board.graph.parents[i]:
			if not board.taken[parent]:
				count += 1
		if not board.taken[i] and board.blockers[i] != count:
			return invariant_error("BLOCKER_MISMATCH")
		if board.taken[i] and not seen.has(cells[i].id):
			cleared_types[cells[i].type] = cleared_types.get(cells[i].type, 0) + 1
	for count in cleared_types.values():
		if count % 3 != 0:
			return invariant_error("CLEARED_TYPE_CONSERVATION")
	var rack_types := {}
	for id in board.rack:
		var type := tile_type(board, id)
		rack_types[type] = rack_types.get(type, 0) + 1
	for count in rack_types.values():
		if count >= 3:
			return invariant_error("UNRESOLVED_TRIPLE")
	if board.rack.size() > 7 or board.status != status_of(board):
		return invariant_error("INVALID_ROUND_STATUS")
	return {"ok": true, "code": "VALID_BOARD"}
