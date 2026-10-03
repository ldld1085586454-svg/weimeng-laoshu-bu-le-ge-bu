extends RefCounted

const Round = preload("res://rules/round_reducer.gd")

func run(a) -> bool:
	if not FileAccess.file_exists("res://session/recovery_policy.gd"):
		a.truth(false, "recovery policy implementation exists")
		return true
	var policy = load("res://session/recovery_policy.gd")
	if policy == null or not policy.can_instantiate():
		a.truth(false, "recovery policy loads")
		return true
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/oracle.json"))
	var fixture: Dictionary = oracle.cases[0]
	var playing: Dictionary = Round.create(fixture.deal, fixture.roundId)
	var won: Dictionary = fixture.steps[-1].result.state
	var record := {"state": playing, "meta": _meta(playing.roundId)}
	a.equal(policy.inspect({}, "local", 1000).action, "none", "no save")
	a.equal(policy.inspect(record, "local", 1000).action, "none", "ordinary playing does not resume")
	var before := record.duplicate(true)
	a.equal(policy.inspect(record, "other", 1000).code, "WRONG_SCOPE", "scope isolation")
	a.equal(record, before, "inspection does not mutate record")
	a.equal(policy.inspect(record, "local", 5000).code, "CYCLE_EXPIRED", "expiry exact boundary rejected")
	record.state = won
	a.equal(policy.inspect(record, "local", 4999).action, "settle_terminal", "won recovered even before outbox preparation")
	record.meta.settlementPending = true
	a.equal(policy.inspect(record, "local", 5000).action, "error", "pending unaccepted expired terminal rejected")
	record.meta.settlementAccepted = true
	a.equal(policy.inspect(record, "local", 9000).action, "settle_terminal", "accepted old terminal remains retryable")
	for source in oracle.cases:
		for step in source.steps:
			var s: Dictionary = step.result.state
			var r := {"state": s, "meta": _meta(s.roundId)}
			if s.pending != null:
				var result: Dictionary = policy.inspect(r, "local", 1000)
				if s.pending.phase == "EARNED":
					a.equal(result.action, "recover_earned", source.name + " earned reward recovers")
					a.equal(result.record.state, s, "earned token and receipts retained")
				else:
					a.equal(result.action, "none", source.name + " unearned reward does not resume")
					a.equal(result.record.state.pending, null, "unearned reward interrupted")
					a.equal(result.record.state.used, s.used, "interruption grants nothing")
					a.equal(result.record.state.commands[-1].type, "INTERRUPT", "interruption is a real reducer command")
			elif s.board.status == "LOST":
				a.equal(policy.inspect(r, "local", 1000).action, "none" if s.used.revive == 0 else "settle_terminal", "lost recovery uses source confirmation gate")
				r.meta.settlementPending = true
				a.equal(policy.inspect(r, "local", 1000).action, "settle_terminal", "confirmed loss resumes settlement")
	for source in oracle.cases:
		if source.name != "revive-append-existing-buffer":
			continue
		var revived: Dictionary = source.steps[-1].result.state
		var lost: Dictionary = Round.dispatch(revived, {"id": "second-loss", "roundId": revived.roundId, "expectedRevision": revived.revision, "type": "PICK", "tileId": "t1"}).state
		a.equal(lost.board.status, "LOST", "real second failure fixture reaches terminal loss")
		a.equal(policy.inspect({"state": lost, "meta": _meta(lost.roundId)}, "local", 1000).action, "settle_terminal", "exhausted revive loss recovers without invented confirmation command")
	return true

func _meta(id: String) -> Dictionary:
	return {"scope": "local", "ticket": {"id": id, "expiresAt": 5000}, "elapsedMs": 250, "settlementPending": false}
