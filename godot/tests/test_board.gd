extends RefCounted

const Board = preload("res://rules/board_reducer.gd")

func projected(board: Dictionary) -> Dictionary:
	return {"legal": Board.legal_tiles(board), "rack": board.rack, "buffer": board.buffer,
		"taken": board.taken, "blockers": board.blockers, "cleared": board.cleared,
		"status": board.status, "revision": board.revision, "undo": board.undo}

func run(a: RefCounted) -> bool:
	var fixture: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/board_cases.json"))
	a.equal(fixture.sourceCommit, "362c61027b7a7f7e573f4b28608e3b3098e2092a", "board oracle source revision")
	for scenario in fixture.cases:
		var original: Dictionary = scenario.deal.duplicate(true)
		var board := Board.create(scenario.deal, scenario.roundId)
		a.equal(board, scenario.initial, scenario.name + " initial state")
		a.equal(scenario.deal, original, scenario.name + " create leaves deal untouched")
		if board.is_empty():
			continue
		if scenario.full:
			a.equal(Board.legal_tiles(board), scenario.initialLegal, scenario.name + " initial legal IDs")
		for i in range(scenario.steps.size()):
			var step: Dictionary = scenario.steps[i]
			var label: String = scenario.name + " step " + str(i)
			var before: Dictionary = board.duplicate(true)
			var result: Dictionary
			if step.action.kind == "pick":
				result = Board.pick(board, step.action.id)
			else:
				result = Board.apply_assist(board, step.action.assist, step.action.get("permutation", []))
			a.equal(board, before, label + " input immutable")
			var actual := result.duplicate(false)
			if not scenario.full:
				actual.state = projected(result.state)
			a.equal(actual, step.expected, label + " JS result")
			if not a.equivalent(actual, step.expected):
				for key in step.expected.state:
					if not a.equivalent(actual.state.get(key), step.expected.state[key]):
						print("FIRST BOARD DIFFERENCE ", label, " field=", key)
						break
				break
			board = result.state
			a.truth(Board.check_invariants(board).ok, label + " invariants")
			if scenario.full:
				a.equal(Board.legal_tiles(board), step.expectedLegal, label + " JS legal IDs")
				for assist in step.eligibility:
					a.equal(Board.eligible(board, assist), step.eligibility[assist], label + " eligibility " + assist)
		if scenario.name.begins_with("developer-acceptance-receipt-"):
			a.equal(board.status, "WON", scenario.name + " developer acceptance WON")
			a.equal(board.cleared, board.deal.cells.size(), scenario.name + " all cells cleared")
			print("BOARD WITNESS ", scenario.name, " steps=", scenario.steps.size(), " status=", board.status)
	var pristine: Dictionary = fixture.cases[1].initial.duplicate(true)
	a.equal(Board.check_invariants(pristine), {"ok": true, "code": "VALID_BOARD"}, "valid initial invariant shape")
	var bad := pristine.duplicate(true)
	bad.taken[0] = 1
	a.equal(Board.check_invariants(bad).code, "INVALID_TAKEN_MASK", "taken mask requires booleans")
	bad = pristine.duplicate(true)
	bad.cleared = 1
	a.equal(Board.check_invariants(bad).code, "INVALID_CLEARED_COUNT", "cleared count multiple of three")
	bad = pristine.duplicate(true)
	bad.buffer = ["t0", "t1", "t2", "t3"]
	a.equal(Board.check_invariants(bad).code, "INVALID_BUFFER", "normal buffer maximum three")
	bad = pristine.duplicate(true)
	bad.rack = ["t0"]
	a.equal(Board.check_invariants(bad).code, "DUPLICATE_OR_MISPLACED_TILE", "rack tile must be taken")
	bad = pristine.duplicate(true)
	bad.taken[0] = true
	a.equal(Board.check_invariants(bad).code, "CARD_CONSERVATION", "unaccounted taken tile rejected")
	bad = pristine.duplicate(true)
	bad.blockers[0] = 1
	a.equal(Board.check_invariants(bad).code, "BLOCKER_MISMATCH", "untaken blockers exact")
	bad = pristine.duplicate(true)
	bad.cleared = 3
	for i in [0, 1, 2]:
		bad.taken[i] = true
	a.equal(Board.check_invariants(bad).code, "CLEARED_TYPE_CONSERVATION", "removed types must each clear triples")
	bad = pristine.duplicate(true)
	bad.rack = ["t0", "t10", "t20"]
	for i in [0, 10, 20]:
		bad.taken[i] = true
	a.equal(Board.check_invariants(bad).code, "UNRESOLVED_TRIPLE", "rack cannot retain triple")
	bad = pristine.duplicate(true)
	bad.status = "WON"
	a.equal(Board.check_invariants(bad).code, "INVALID_ROUND_STATUS", "won must require all cleared")
	bad = pristine.duplicate(true)
	bad.rack = ["t0", "t0"]
	bad.taken[0] = true
	a.equal(Board.check_invariants(bad).code, "DUPLICATE_OR_MISPLACED_TILE", "duplicate rack tile rejected")
	bad = pristine.duplicate(true)
	bad.rack = ["unknown"]
	a.equal(Board.check_invariants(bad).code, "DUPLICATE_OR_MISPLACED_TILE", "unknown rack tile rejected")
	bad = pristine.duplicate(true)
	for i in range(8):
		bad.taken[i] = true
		bad.rack.append("t" + str(i))
	bad.status = "LOST"
	a.equal(Board.check_invariants(bad).code, "INVALID_ROUND_STATUS", "eight slots always invalid")
	for scenario in fixture.cases:
		if scenario.name != "revive-preserves-buffer-six":
			continue
		for step in scenario.steps:
			if step.expected.code != "REVIVED_CANDIDATE":
				continue
			var revived: Dictionary = step.expected.state
			a.truth(Board.check_invariants(revived).ok, "research candidate permits six reserve tiles")
			bad = revived.duplicate(true)
			bad.erase("reviveCandidate")
			a.equal(Board.check_invariants(bad).code, "INVALID_BUFFER", "six reserve tiles need candidate label")
			bad = revived.duplicate(true)
			bad.revivalApplied = false
			a.equal(Board.check_invariants(bad).code, "INVALID_BUFFER", "six reserve tiles need applied flag")
	a.equal(Board.create(fixture.cases[0].deal, "  "), {"ok": false, "code": "INVALID_ROUND_ID"}, "empty round ID rejected")
	var invalid_deal: Dictionary = fixture.cases[0].deal.duplicate(true)
	invalid_deal.slotCapacity = 8
	a.equal(Board.create(invalid_deal, "invalid"), {"ok": false, "code": "RUNTIME_REQUIRES_SEVEN_SLOTS"}, "create validates deal boundary")
	return true
