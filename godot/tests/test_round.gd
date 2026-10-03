extends RefCounted

const Canonical = preload("res://rules/canonical_json.gd")

func run(a) -> bool:
	var script = load("res://rules/round_reducer.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "round reducer loads")
		return false
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/oracle.json"))
	var steps := 0
	for fixture in oracle.cases:
		var state: Dictionary = script.create(fixture.deal, fixture.roundId)
		a.equal(state, fixture.initialState, fixture.name + " initial source state")
		for step in fixture.steps:
			var before := state.duplicate(true)
			var result: Dictionary = script.dispatch(state, step.command)
			a.equal(result, step.result, fixture.name + " command " + str(steps))
			a.equal(state, before, fixture.name + " prior state immutable")
			state = result.state
			a.equal(script.fingerprint(state), step.fingerprint, fixture.name + " source fingerprint")
			steps += 1
		a.equal(script.fingerprint(state), fixture.finalFingerprint, fixture.name + " final fingerprint")
		a.equal(script.metrics(state), fixture.metrics, fixture.name + " source metrics")
	a.equal(steps, 98, "all fixed oracle commands covered")
	var deal: Dictionary = oracle.cases[0].deal
	a.equal(script.create(deal, " ").code, "ROUND_ID_REQUIRED", "blank round ID rejected")
	a.equal(script.create(deal, "x".repeat(161)).code, "ROUND_ID_REQUIRED", "long round ID rejected")
	a.equal(script.create({}, "valid").ok, false, "invalid deal returns explicit error")
	var state: Dictionary = script.create(deal, "guard")
	var original := state.duplicate(true)
	var base := {"id": "c1", "roundId": "guard", "expectedRevision": 0, "type": "PICK", "tileId": "teach-0"}
	for change in [{"id": ""}, {"id": " \t\n"}, {"id": 7}, {"id": "x".repeat(161)}, {"id": "😀".repeat(81)}, {"roundId": ""}, {"roundId": "x".repeat(161)}, {"expectedRevision": -1}, {"expectedRevision": 0.5}, {"expectedRevision": true}, {"expectedRevision": 9007199254740992}, {"type": "UNKNOWN"}, {"type": 1}, {"tileId": ""}, {"tileId": 1}, {"extra": 1}, {"commandId": "wrong-field"}]:
		var command := base.duplicate(true)
		command.merge(change, true)
		_check_reject(a, script, state, command, "INVALID_COMMAND")
	var wrong := base.duplicate()
	wrong.roundId = "other"
	_check_reject(a, script, state, wrong, "WRONG_ROUND")
	var stale := base.duplicate()
	stale.expectedRevision = 1
	_check_reject(a, script, state, stale, "STALE_REVISION")
	var whitespace := base.duplicate()
	whitespace.tileId = " "
	_check_reject(a, script, state, whitespace, "UNKNOWN_TILE")
	var boundary := base.duplicate()
	boundary.id = "😀".repeat(80)
	a.truth(script.dispatch(state, boundary).ok, "160 UTF-16 code unit command ID accepted")
	a.equal(state, original, "all validation probes preserve source state")
	var accepted: Dictionary = script.dispatch(state, base)
	state = accepted.state
	var ordered := {"tileId": "teach-0", "type": "PICK", "expectedRevision": 0, "roundId": "guard", "id": "c1"}
	a.equal(script.dispatch(state, ordered), {"ok": true, "code": "PICKED", "state": state, "events": [], "replayed": true}, "reordered same command replay before revision guard")
	var conflict := base.duplicate()
	conflict.tileId = "teach-1"
	_check_reject(a, script, state, conflict, "COMMAND_ID_CONFLICT")
	conflict = base.duplicate()
	conflict.expectedRevision = 1
	_check_reject(a, script, state, conflict, "COMMAND_ID_CONFLICT")
	wrong = base.duplicate()
	wrong.roundId = "other"
	_check_reject(a, script, state, wrong, "WRONG_ROUND")
	var limited := state.duplicate(true)
	limited.commands.resize(10000)
	var fresh := {"id": "fresh", "roundId": "guard", "expectedRevision": 1, "type": "PICK", "tileId": "teach-1"}
	_check_reject(a, script, limited, fresh, "COMMAND_LIMIT")
	a.equal(script.dispatch(limited, base).replayed, true, "receipt replay wins at command limit")
	var copied_deal := deal.duplicate(true)
	var isolated: Dictionary = script.create(copied_deal, "isolation")
	copied_deal.cells[0].type = "mutated"
	a.equal(isolated.initialDeal.cells[0].type, "T00", "create isolates caller deal")
	return true

func _check_reject(a, script, state: Dictionary, command: Dictionary, code: String) -> void:
	var before := state.duplicate(true)
	a.equal(script.dispatch(state, command), {"ok": false, "code": code, "state": before, "events": [], "replayed": false}, "reject " + code)
	a.equal(state, before, "reject " + code + " preserves state")
