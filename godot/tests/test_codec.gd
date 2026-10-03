extends RefCounted

const Round = preload("res://rules/round_reducer.gd")
const Canonical = preload("res://rules/canonical_json.gd")

func run(a) -> bool:
	if not FileAccess.file_exists("res://storage/round_codec.gd"):
		a.truth(false, "round codec implementation exists")
		return true
	var codec = load("res://storage/round_codec.gd")
	if codec == null or not codec.can_instantiate():
		a.truth(false, "round codec loads")
		return true
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/oracle.json"))
	for fixture in oracle.cases:
		var state: Dictionary = Round.create(fixture.deal, fixture.roundId)
		var meta := {"scope": "local:测试", "ticket": {"id": fixture.roundId, "expiresAt": 5000}, "elapsedMs": 1234, "settlementPending": false}
		for step in fixture.steps:
			state = Round.dispatch(state, step.command).state
			var encoded: String = codec.encode(state, meta)
			a.truth(not encoded.is_empty(), fixture.name + " encoded")
			var restored: Dictionary = codec.restore(encoded)
			a.truth(restored.ok, fixture.name + " replay restores")
			if restored.ok:
				a.equal(restored.state, state, fixture.name + " exact replay state including receipts/token")
				a.equal(restored.meta, meta, fixture.name + " exact metadata")
	var state: Dictionary = Round.create(oracle.cases[0].deal, "codec")
	var meta := {"scope": "local", "ticket": {"id": "codec", "expiresAt": 5000}, "elapsedMs": 0, "settlementPending": false}
	var encoded: String = codec.encode(state, meta)
	var envelope: Dictionary = JSON.parse_string(encoded)
	a.equal(envelope.payload.schema, "godot-round-v1", "new Godot envelope schema")
	a.equal(envelope.payload.version, "full-round-v012", "source rules protocol")
	a.equal(codec.restore("not json").code, "INVALID_SAVE", "malformed save rejected")
	a.equal(codec.restore("[]").code, "INVALID_SAVE", "nonobject save rejected")
	a.equal(codec.restore("x".repeat(8 * 1024 * 1024 + 1)).code, "SAVE_TOO_LARGE", "8 MiB limit")
	a.equal(codec.restore("卜".repeat(8 * 1024 * 1024 / 3 + 1)).code, "SAVE_TOO_LARGE", "limit counts UTF8 bytes")
	var changed := envelope.duplicate(true)
	changed.payload.meta.elapsedMs = 999
	a.equal(codec.restore(Canonical.encode(changed)).code, "SAVE_CHECKSUM_MISMATCH", "metadata covered by checksum")
	changed = envelope.duplicate(true)
	changed.payload.version = "old"
	a.equal(_restore_changed(codec, changed).code, "INVALID_SAVE_VERSION", "wrong rules protocol rejected")
	changed = envelope.duplicate(true)
	changed.payload.schema = "other"
	a.equal(_restore_changed(codec, changed).code, "INVALID_SAVE_VERSION", "wrong Godot schema rejected")
	changed = envelope.duplicate(true)
	changed.payload.fingerprint = "0".repeat(64)
	a.equal(_restore_changed(codec, changed).code, "SAVE_STATE_MISMATCH", "fingerprint verified after replay")
	changed = envelope.duplicate(true)
	changed.payload.commands = [{"id": "bad", "roundId": "codec", "expectedRevision": 0, "type": "PICK", "tileId": "unknown"}]
	a.equal(_restore_changed(codec, changed).code, "SAVE_REPLAY_REJECTED:UNKNOWN_TILE", "rejected command never restores")
	changed = envelope.duplicate(true)
	changed.payload.commands = [{"id": "one", "roundId": "codec", "expectedRevision": 0, "type": "PICK", "tileId": "teach-0"}]
	changed.payload.commands.append(changed.payload.commands[0].duplicate())
	a.equal(_restore_changed(codec, changed).code, "SAVE_REPLAY_REJECTED:PICKED", "duplicate receipt replay rejected as a persisted command")
	for field in ["roundId", "initialDeal", "commands", "fingerprint", "meta"]:
		changed = envelope.duplicate(true)
		changed.payload.erase(field)
		a.equal(_restore_changed(codec, changed).ok, false, "missing required " + field)
	changed = envelope.duplicate(true)
	changed.payload.state = state
	a.equal(_restore_changed(codec, changed).code, "INVALID_SAVE", "unverified state snapshot cannot override replay")
	for patch in [{"ticket": {"id": "other", "expiresAt": 5000}}, {"ticket": null}, {"scope": ""}, {"elapsedMs": -1}, {"elapsedMs": 0.5}, {"elapsedMs": true}, {"elapsedMs": 9007199254740992}, {"settlementPending": 1}, {"hidden": "yes"}, {"settlementAccepted": 1}]:
		changed = envelope.duplicate(true)
		changed.payload.meta.merge(patch, true)
		a.equal(_restore_changed(codec, changed).code, "INVALID_SAVE_META", "invalid metadata " + str(patch))
	changed = envelope.duplicate(true)
	changed.payload.initialDeal.cells[0].type = "T14"
	a.equal(_restore_changed(codec, changed).ok, false, "initial deal hash validation")
	changed = envelope.duplicate(true)
	changed.payload.commands.resize(10001)
	a.equal(_restore_changed(codec, changed).code, "INVALID_SAVE_VERSION", "command count limited before replay")
	var won: Dictionary = oracle.cases[0].steps[-1].result.state
	var terminal_meta := {"scope": "local", "ticket": {"id": won.roundId, "expiresAt": 5000}, "elapsedMs": 1234, "settlementPending": true, "settlementAccepted": false}
	var submission := {"ticketId": won.roundId, "log": codec.encode(won, terminal_meta), "elapsedMs": 1234}
	terminal_meta.settlementPayload = submission
	var terminal_envelope: Dictionary = JSON.parse_string(codec.encode(won, terminal_meta))
	a.truth(codec.restore(Canonical.encode(terminal_envelope)).ok, "frozen terminal payload validated")
	changed = terminal_envelope.duplicate(true)
	changed.payload.meta.elapsedMs = 1235
	changed.payload.meta.settlementPayload.elapsedMs = 1235
	a.equal(_restore_changed(codec, changed).code, "INVALID_SETTLEMENT_PAYLOAD", "frozen log duration cannot differ from outer duration")
	changed = terminal_envelope.duplicate(true)
	changed.payload.meta.settlementPayload.log = codec.encode(state, meta)
	a.equal(_restore_changed(codec, changed).code, "INVALID_SETTLEMENT_PAYLOAD", "frozen payload cannot target different replay")
	changed = terminal_envelope.duplicate(true)
	changed.payload.meta.settlementPayload.ticketId = "other"
	a.equal(_restore_changed(codec, changed).code, "INVALID_SAVE_META", "frozen payload ticket must equal round")
	changed = terminal_envelope.duplicate(true)
	changed.payload.meta.settlementPayload.log = Canonical.encode(terminal_envelope)
	a.equal(_restore_changed(codec, changed).code, "INVALID_SETTLEMENT_PAYLOAD", "nested frozen payloads are forbidden")
	return true

func _restore_changed(codec, envelope: Dictionary) -> Dictionary:
	envelope.checksum = Canonical.encode(envelope.payload).sha256_text()
	return codec.restore(Canonical.encode(envelope))
