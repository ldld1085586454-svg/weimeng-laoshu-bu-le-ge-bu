extends RefCounted

const Round = preload("res://rules/round_reducer.gd")
var provider_events: Array = []
var sequence := 0

func run(a) -> bool:
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/oracle.json"))
	var flat: Dictionary = oracle.cases[5].deal
	var state: Dictionary = Round.create(flat, "rewards")
	for change in [{"assist": "bad"}, {"assist": null}, {"assist": {}}, {"assist": 1}]:
		_reject(a, state, "OFFER", change, "UNKNOWN_ASSIST")
	for channel in [null, "", "ad", {}, 1]:
		_reject(a, state, "OFFER", {"assist": "shuffle", "channel": channel}, "UNKNOWN_CHANNEL")
	_reject(a, state, "OFFER", {"assist": "move", "channel": "video"}, "NOT_ENOUGH_RACK_TILES")
	_reject(a, state, "OFFER", {"assist": "undo", "channel": "video"}, "NO_UNDO")
	_reject(a, state, "OFFER", {"assist": "revive", "channel": "video"}, "REVIVE_REQUIRES_LOST")
	for permutation in [null, [], ["wrong"], "bad", ["A"].duplicate(), _repeated("A", 3001)]:
		_reject(a, state, "OFFER", {"assist": "shuffle", "channel": "video", "permutation": permutation}, "INVALID_SHUFFLE_PERMUTATION")
	state = _send(a, state, "PICK", {"tileId": "t0"}).state
	_reject(a, state, "OFFER", {"assist": "undo", "channel": "video", "permutation": []}, "UNEXPECTED_PERMUTATION")
	for type in ["LAUNCH", "SHARE_HIDE", "SHARE_RETURN", "AD_CLOSE", "FAIL", "CANCEL", "COMMIT", "APPLY_FAILED", "INTERRUPT"]:
		for token in [null, "", " ", "x".repeat(161), 1]:
			_reject(a, state, type, {"token": token}, "INVALID_COMMAND")
		_reject(a, state, type, {"token": "no-pending", "extra": true}, "INVALID_COMMAND")
		_reject(a, state, type, {"token": "no-pending"}, "NO_PENDING_REWARD")
	for is_ended in [null, 1, "true"]:
		_reject(a, state, "AD_CLOSE", {"token": "no-pending", "isEnded": is_ended}, "INVALID_COMMAND")
	var offered := _send(a, state, "OFFER", {"assist": "undo", "channel": "video"})
	state = offered.state
	var token: String = state.pending.token
	a.equal(state.board.revision, 1, "OFFER leaves board revision")
	a.equal(state.revision, 2, "OFFER increments round revision")
	_reject(a, state, "PICK", {"tileId": "t1"}, "REWARD_PENDING")
	_reject(a, state, "OFFER", {"assist": "shuffle", "channel": "share"}, "REWARD_PENDING")
	_reject(a, state, "LAUNCH", {"token": "wrong"}, "WRONG_REWARD_TOKEN")
	_reject(a, state, "COMMIT", {"token": token}, "REWARD_NOT_EARNED")
	_reject(a, state, "APPLY_FAILED", {"token": token}, "REWARD_NOT_EARNED")
	var changed := state.duplicate(true)
	changed.pending.boardRevision += 1
	_reject(a, changed, "LAUNCH", {"token": token}, "REWARD_STATE_CHANGED")
	changed = state.duplicate(true)
	changed.pending.roundId = "old-round"
	_reject(a, changed, "LAUNCH", {"token": token}, "REWARD_STATE_CHANGED")
	state = _send(a, state, "LAUNCH", {"token": token}).state
	_reject(a, state, "LAUNCH", {"token": token}, "INVALID_TRANSITION")
	_reject(a, state, "SHARE_HIDE", {"token": token}, "INVALID_TRANSITION")
	_reject(a, state, "SHARE_RETURN", {"token": token}, "SHARE_RETURN_NOT_QUALIFIED")
	state = _send(a, state, "AD_CLOSE", {"token": token, "isEnded": true}).state
	a.equal(state.pending.phase, "EARNED", "video completion earns pending only")
	a.equal(state.used.undo, 0, "earning does not debit quota")
	a.equal(state.board.revision, 1, "earning does not apply board effect")
	for type in ["CANCEL", "FAIL", "INTERRUPT"]:
		_reject(a, state, type, {"token": token}, "EARNED_REWARD_MUST_BE_RECOVERED")
	_reject(a, state, "AD_CLOSE", {"token": token, "isEnded": true}, "INVALID_TRANSITION")
	state = _send(a, state, "APPLY_FAILED", {"token": token}).state
	a.equal(state.pending.recoveryReason, "APPLY_OR_STORAGE_FAILED", "failed application retains recovery reason")
	a.equal(state.used.undo, 0, "failed application does not debit quota")
	var ineligible := state.duplicate(true)
	ineligible.board.undo = null
	_reject(a, ineligible, "COMMIT", {"token": token}, "NO_UNDO")
	changed = state.duplicate(true)
	changed.used.undo = 1
	_reject(a, changed, "COMMIT", {"token": token}, "ASSIST_EXHAUSTED")
	var committed := _send(a, state, "COMMIT", {"token": token})
	state = committed.state
	a.equal(state.pending, null, "commit clears pending")
	a.equal(state.resolved[token], {"status": "APPLIED", "assist": "undo", "channel": "video"}, "commit resolves token")
	a.equal(state.used.undo, 1, "commit debits exactly once")
	a.equal(state.board.revision, 2, "commit advances board revision")
	a.equal(Round.metrics(state).grants, 1, "one grant applied")
	_reject(a, state, "COMMIT", {"token": token}, "REWARD_ALREADY_RESOLVED")
	_reject(a, state, "AD_CLOSE", {"token": token, "isEnded": true}, "REWARD_ALREADY_RESOLVED")
	_reject(a, state, "OFFER", {"assist": "undo", "channel": "share"}, "ASSIST_EXHAUSTED")
	_reject(a, state, "PICK", {"tileId": "unknown"}, "UNKNOWN_TILE")
	a.equal(state.unresumed, [token], "failed pick preserves resume marker")
	state = _send(a, state, "PICK", {"tileId": "t1"}).state
	a.equal(Round.metrics(state).continuedAfterGrant, 1, "first subsequent pick emits resume")
	state = _send(a, state, "PICK", {"tileId": "t2"}).state
	a.equal(Round.metrics(state).continuedAfterGrant, 1, "second subsequent pick cannot repeat resume")
	for fixture in oracle.cases:
		if fixture.name in ["move-buffer-return", "undo-video", "shuffle-video", "revive-append-existing-buffer"]:
			var replay: Dictionary = Round.create(fixture.deal, fixture.roundId)
			for step in fixture.steps:
				replay = Round.dispatch(replay, step.command).state
			var assist := "move" if fixture.name == "move-buffer-return" else "undo" if fixture.name == "undo-video" else "shuffle" if fixture.name == "shuffle-video" else "revive"
			_reject(a, replay, "OFFER", {"assist": assist, "channel": "share"}, "ASSIST_EXHAUSTED")
	for termination in ["CANCEL", "FAIL", "INTERRUPT", "AD_CLOSE_FALSE", "AD_CLOSE_UNKNOWN"]:
		var fresh: Dictionary = Round.create(flat, termination)
		fresh = _send(a, fresh, "PICK", {"tileId": "t0"}).state
		fresh = _send(a, fresh, "OFFER", {"assist": "undo", "channel": "video"}).state
		var fresh_token: String = fresh.pending.token
		fresh = _send(a, fresh, "LAUNCH", {"token": fresh_token}).state
		var result: Dictionary
		if termination == "AD_CLOSE_FALSE":
			result = _send(a, fresh, "AD_CLOSE", {"token": fresh_token, "isEnded": false})
		elif termination == "AD_CLOSE_UNKNOWN":
			result = _send(a, fresh, "AD_CLOSE", {"token": fresh_token})
		else:
			result = _send(a, fresh, termination, {"token": fresh_token})
		a.equal(result.state.pending, null, termination + " closes pending")
		a.equal(result.state.used.undo, 0, termination + " does not consume quota")
		a.equal(Round.metrics(result.state).grants, 0, termination + " does not grant")
	var share: Dictionary = Round.create(flat, "share")
	share = _send(a, share, "PICK", {"tileId": "t0"}).state
	share = _send(a, share, "OFFER", {"assist": "undo", "channel": "share"}).state
	var share_token: String = share.pending.token
	share = _send(a, share, "LAUNCH", {"token": share_token}).state
	_reject(a, share, "SHARE_RETURN", {"token": share_token}, "SHARE_RETURN_NOT_QUALIFIED")
	_reject(a, share, "AD_CLOSE", {"token": share_token, "isEnded": true}, "INVALID_TRANSITION")
	share = _send(a, share, "SHARE_HIDE", {"token": share_token}).state
	share = _send(a, share, "SHARE_HIDE", {"token": share_token}).state
	var returned := _send(a, share, "SHARE_RETURN", {"token": share_token})
	a.equal(returned.events[1].verifiedSend, false, "share return cannot claim verified send")
	a.equal(returned.events[1].source, "accepted-return-candidate", "share source candidate exact")
	var permutation: Array = []
	for cell in flat.cells:
		permutation.append(cell.type)
	var caller_command := _command(Round.create(flat, "copied"), "OFFER", {"assist": "shuffle", "channel": "video", "permutation": permutation})
	var copied: Dictionary = Round.dispatch(Round.create(flat, "copied"), caller_command)
	caller_command.permutation[0] = "mutated"
	a.equal(copied.state.pending.permutation[0], "A", "pending permutation isolates caller command")
	a.equal(copied.state.commands[0].permutation[0], "A", "stored command isolates caller permutation")
	if not _adapter_tests(a):
		return false
	return true

func _adapter_tests(a) -> bool:
	var base = load("res://platform/reward_adapter.gd")
	var simulation = load("res://platform/simulation_reward_adapter.gd")
	var capabilities = load("res://platform/capabilities.gd")
	if base == null or simulation == null or capabilities == null:
		a.truth(false, "reward adapters and capabilities load")
		return false
	var request := {"roundId": "adapter-round", "token": "adapter-token", "assist": "move", "channel": "video"}
	var adapter = base.new()
	adapter.result.connect(_record_event)
	provider_events.clear()
	adapter.launch(request)
	a.equal(provider_events, [{"roundId": "adapter-round", "token": "adapter-token", "kind": "failed"}], "base unsupported launch reports correlated failure")
	var simulator = simulation.new()
	simulator.result.connect(_record_event)
	for method in ["complete_video", "close_video_early", "close_video_unverified", "cancel", "fail_request"]:
		provider_events.clear()
		simulator.launch(request)
		a.equal(provider_events, [], "launch waits for explicit " + method)
		simulator.call(method)
		var event := {"roundId": "adapter-round", "token": "adapter-token", "kind": "ad_close"}
		if method == "complete_video": event.isEnded = true
		elif method == "close_video_early": event.isEnded = false
		elif method == "cancel": event.kind = "cancelled"
		elif method == "fail_request": event.kind = "failed"
		a.equal(provider_events, [event], "manual " + method + " exact provider event")
		simulator.call(method)
		simulator.cancel()
		a.equal(provider_events, [event], "terminal " + method + " callback not repeated")
	var share_request := request.duplicate()
	share_request.channel = "share"
	provider_events.clear()
	simulator.launch(share_request)
	simulator.share_return()
	simulator.complete_video()
	a.equal(provider_events, [], "share return requires manual hide and video completion cannot fake it")
	simulator.share_hide()
	simulator.share_hide()
	simulator.share_return()
	a.equal(provider_events, [{"roundId": "adapter-round", "token": "adapter-token", "kind": "share_hide"}, {"roundId": "adapter-round", "token": "adapter-token", "kind": "share_return"}], "manual share hide return exact unverified events")
	simulator.share_return()
	a.equal(provider_events.size(), 2, "share terminal event once")
	for invalid_change in [{"channel": "real-ad"}, {"assist": "bad"}, {"extra": true}, {"assist": null}]:
		provider_events.clear()
		var invalid := request.duplicate()
		invalid.merge(invalid_change, true)
		simulator.launch(invalid)
		a.equal(provider_events, [{"roundId": "adapter-round", "token": "adapter-token", "kind": "failed"}], "invalid launch fails with original request correlation")
	provider_events.clear()
	var copied_request := request.duplicate()
	simulator.launch(copied_request)
	copied_request.token = "mutated"
	simulator.complete_video()
	a.equal(provider_events[0].token, "adapter-token", "simulation isolates caller request")
	provider_events.clear()
	simulator.launch(request)
	var other := request.duplicate()
	other.token = "second-token"
	simulator.launch(other)
	simulator.complete_video()
	a.equal(provider_events, [{"roundId": "adapter-round", "token": "second-token", "kind": "failed"}, {"roundId": "adapter-round", "token": "adapter-token", "kind": "ad_close", "isEnded": true}], "busy launch reports new request failure while retaining original active request")
	a.equal(capabilities.describe(), {"localIdentity": true, "rewardSimulation": true, "wx": false, "cloud": false, "friends": false, "ads": false, "share": false, "vibration": false}, "native capability integrations explicit")
	return true

func _record_event(event: Dictionary) -> void:
	provider_events.append(event.duplicate(true))

func _command(state: Dictionary, type: String, extra: Dictionary) -> Dictionary:
	sequence += 1
	var command := {"id": "reward-test-" + str(sequence), "roundId": state.roundId, "expectedRevision": state.revision, "type": type}
	command.merge(extra, true)
	return command

func _send(a, state: Dictionary, type: String, extra: Dictionary) -> Dictionary:
	var before := state.duplicate(true)
	var result: Dictionary = Round.dispatch(state, _command(state, type, extra))
	a.truth(result.ok, "accept " + type + " " + result.code)
	a.equal(state, before, "accept " + type + " preserves prior state")
	return result

func _reject(a, state: Dictionary, type: String, extra: Dictionary, code: String) -> void:
	var before := state.duplicate(true)
	a.equal(Round.dispatch(state, _command(state, type, extra)), {"ok": false, "code": code, "state": before, "events": [], "replayed": false}, "reward reject " + type + " " + code)
	a.equal(state, before, "reward reject " + type + " preserves state")

func _repeated(value: Variant, size: int) -> Array:
	var values: Array = []
	values.resize(size)
	values.fill(value)
	return values
