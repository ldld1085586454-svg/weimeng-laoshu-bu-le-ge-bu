extends RefCounted

const Catalog = preload("res://services/catalog.gd")
const Round = preload("res://rules/round_reducer.gd")
const Board = preload("res://rules/board_reducer.gd")
const Canonical = preload("res://rules/canonical_json.gd")
const Memory = preload("res://tests/helpers/service_memory_store.gd")
var now := 1790956800000
var codec
var service_script
var witness: Dictionary

func run(a) -> bool:
	if not FileAccess.file_exists("res://services/local_game_service.gd"):
		a.truth(false, "local service implementation exists")
		return true
	service_script = load("res://services/local_game_service.gd")
	codec = load("res://storage/round_codec.gd")
	if service_script == null or not service_script.can_instantiate() or codec == null or not codec.can_instantiate():
		a.truth(false, "service and real codec load")
		return true
	witness = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/board_cases.json"))
	if "--service-collation" in OS.get_cmdline_user_args():
		return _collation(a)
	if "--service-frozen-contract" in OS.get_cmdline_user_args():
		return _frozen_contract(a)
	a.truth(_collation(a), "honor identifier collation checks completed")
	a.truth(_frozen_contract(a), "frozen settlement metadata checks completed")
	var store := Memory.new()
	var service = _service(store)
	a.equal(service.call("bad user", "bootstrap", {}).code, "INVALID_USER", "user id validated")
	a.equal(service.call("alice", "unknown", {}).code, "UNKNOWN_ACTION", "action allowlist")
	a.equal(service.call("alice", "bootstrap", []).code, "INVALID_PAYLOAD", "array payload rejected")
	var boot: Dictionary = service.call("alice", "bootstrap", {}).data
	a.equal(boot.totals, {"wins": 0, "attempts": 0}, "empty database has no virtual contributions")
	a.equal(boot.history.records, [], "empty history")
	a.equal(boot.topic.scores, [0, 0], "empty topic scores")
	a.equal(boot.honors, {"day": Catalog.cycle(now - Catalog.DAY_MS), "first": null, "fast": null, "king": null}, "empty honors do not fabricate players")
	for i in range(Catalog.regions().size()):
		a.equal(boot.regions[i].name, Catalog.regions()[i], "empty region ties follow catalog order")
	a.equal(boot.profile.id, "alice", "independent identity")
	a.equal(service.call("alice", "equip", {"skin": "cap"}).code, "SKIN_LOCKED", "locked skin rejected")
	a.equal(service.call("alice", "start", {"mode": "wrong"}).code, "INVALID_MODE", "mode allowlist")
	var start: Dictionary = service.call("alice", "start", {"mode": "tutorial"}).data
	a.equal(start.deal.cells.size(), 12, "tutorial uses 12 cards")
	a.equal(start.ticket.userId, "alice", "ticket binds owner")
	a.equal(start.ticket.day, Catalog.cycle(now), "ticket binds day")
	a.equal(start.ticket.expiresAt, Catalog.next_reset(now), "ticket binds expiry")
	a.equal(start.ticket.dealHash, Canonical.snapshot_hash(start.deal), "ticket binds full deal hash")
	var playing := Round.create(start.deal, start.ticket.id)
	var payload := {"ticketId": start.ticket.id, "log": codec.encode(playing, _meta(start.ticket)), "elapsedMs": 0}
	a.equal(service.call("bob", "settle", payload).code, "TICKET_OWNER", "wrong owner rejected")
	a.equal(service.call("alice", "settle", payload).code, "NOT_TERMINAL", "playing cannot settle")
	payload = _payload(start)
	for elapsed in [-1, 0.5, 9007199254740992, 1501]:
		var invalid := payload.duplicate(true)
		invalid.elapsedMs = elapsed
		a.equal(service.call("alice", "settle", invalid).code, "INVALID_DURATION", "invalid elapsed " + str(elapsed))
	var mismatch := payload.duplicate(true)
	var other_ticket: Dictionary = start.ticket.duplicate(true)
	other_ticket.id = "other-round"
	mismatch.log = codec.encode(_win(Catalog.tutorial(), "other-round"), _meta(other_ticket))
	a.equal(service.call("alice", "settle", mismatch).code, "DEAL_MISMATCH", "round id cannot substitute assigned deal")
	var changed := Catalog.tutorial()
	changed.cells[0].type = "T01"
	changed.cells[3].type = "T00"
	mismatch.log = codec.encode(Round.create(changed, start.ticket.id), _meta(start.ticket))
	a.equal(service.call("alice", "settle", mismatch).code, "DEAL_MISMATCH", "same id with different assigned cell content rejected")
	var pending_start: Dictionary = service.call("alice", "start", {"mode": "daily"}).data
	var lost := _lose(pending_start.deal, pending_start.ticket.id)
	a.equal(lost.board.status, "LOST", "real daily play produces loss for pending validation")
	lost = Round.dispatch(lost, {"id": "offer", "roundId": lost.roundId, "expectedRevision": lost.revision, "type": "OFFER", "assist": "revive", "channel": "video"}).state
	a.equal(service.call("alice", "settle", {"ticketId": pending_start.ticket.id, "log": codec.encode(lost, _meta(pending_start.ticket)), "elapsedMs": 0}).code, "NOT_TERMINAL", "pending reward forbids terminal settlement")
	store.fail_key = "social"
	store.fail_count = 1
	a.equal(service.call("alice", "settle", payload).code, "WRITE_FAILED", "settlement failure visible")
	a.equal(service.call("alice", "bootstrap", {}).data.profile.tutorialDone, false, "failed draft never publishes tutorial unlock")
	a.truth(service.call("alice", "settle", payload).ok, "tutorial terminal accepted")
	a.equal(service.call("alice", "bootstrap", {}).data.profile.tutorialDone, true, "durable tutorial unlock")
	var accepted: Dictionary = service.call("alice", "settle", payload)
	a.equal(accepted.data.replayed, true, "same ticket exact payload idempotent")
	now = start.ticket.expiresAt
	a.truth(service.call("alice", "settle", payload).ok, "accepted exact retry succeeds at midnight")
	var conflict := payload.duplicate(true)
	conflict.elapsedMs = 1
	a.equal(service.call("alice", "settle", conflict).code, "SETTLEMENT_CONFLICT", "conflict checked before expiry")
	var old_start: Dictionary = service.call("alice", "start", {"mode": "tutorial"}).data
	var old_payload := _payload(old_start)
	now = old_start.ticket.expiresAt
	a.equal(service.call("alice", "settle", old_payload).code, "CYCLE_EXPIRED", "unaccepted previous cycle rejected")
	now += 1000
	for mode in ["daily", "daily", "topic"]:
		var challenge: Dictionary = service.call("alice", "start", {"mode": mode}).data
		a.truth(service.call("alice", "settle", _payload(challenge)).ok, "real assigned witness settles " + mode)
	boot = service.call("alice", "bootstrap", {}).data
	a.equal(boot.totals, {"wins": 1, "attempts": 2}, "new tickets count attempts but dedupe daily contribution")
	a.equal(boot.history.wins, 1, "history wins counts distinct daily date")
	a.equal(boot.history.records.size(), 4, "history contains real three modes")
	a.equal(boot.topic.scores[boot.topic.team], 1, "topic contribution separate from daily")
	a.truth(service.call("alice", "equip", {"skin": "cap"}).ok, "daily unlock permits equip")
	a.equal(_service(store).call("alice", "bootstrap", {}).data.profile.skin, "cap", "equipped skin survives restart")
	now = Catalog.next_reset(now)
	boot = service.call("alice", "bootstrap", {}).data
	a.truth("scarf" in boot.profile.owned, "own yesterday strict winning topic unlocks scarf")
	a.equal(boot.honors.first.userId, "alice", "yesterday first honor is real settled player")
	a.equal(boot.honors.fast.userId, "alice", "yesterday fastest honor is real settled player")
	a.equal(boot.honors.king.userId, "alice", "yesterday no-assist honor is real settled player")
	a.equal(service.call("bob", "bootstrap", {}).data.profile.owned, ["plain"], "nonparticipant cannot get scarf")
	var next_daily: Dictionary = service.call("alice", "start", {"mode": "daily"}).data
	a.truth(service.call("alice", "settle", _payload(next_daily)).ok, "second distinct daily date settles")
	a.equal(service.call("alice", "bootstrap", {}).data.history.wins, 2, "different daily dates count as distinct wins")
	a.equal(service.call("alice", "bullet", {"id": "invented"}).code, "INVALID_BULLET", "only six presets allowed")
	for i in range(105):
		a.truth(service.call("alice", "bullet", {"id": Catalog.bullets()[i % 6].id}).ok, "preset persisted " + str(i))
	a.equal(service.call("alice", "bootstrap", {}).data.bullets.size(), 12, "today display capped at twelve")
	a.equal(JSON.parse_string(store.records.social).bullets.size(), 100, "bullet storage capped at hundred")
	var before: String = store.records.social
	store.fail_count = 1
	a.equal(service.call("alice", "equip", {"skin": "plain"}).code, "WRITE_FAILED", "equip write failure")
	a.equal(store.records.social, before, "failed equip does not change durable database")
	a.equal(service.call("alice", "bootstrap", {}).data.profile.skin, "cap", "failed equip does not publish draft")
	var typed_service := service_script.new() as RefCounted
	typed_service.configure(store, func(): return now)
	a.truth(typed_service.request("alice", "bootstrap", {}).ok, "typed callers have safe request method")
	var invalid_store := Memory.new()
	invalid_store.records.social = '{"version":"godot-social-v1","serial":0,"users":{"broken":{}},"tickets":{},"results":{},"bullets":[]}'
	a.equal(_service(invalid_store).request("broken", "bootstrap", {}).code, "INVALID_SOCIAL_SAVE", "malformed persistent profiles rejected without crash")
	a.truth(_tie(a), "tie integration completed")
	return true

func _service(store):
	var result = service_script.new()
	result.configure(store, func(): return now)
	return result

func _frozen_contract(a) -> bool:
	var wall_before := now
	var store := Memory.new()
	var service = _service(store)
	var start: Dictionary = service.request("alice", "start", {"mode": "tutorial"}).data
	var terminal := _win(start.deal, start.ticket.id)
	var meta := _meta(start.ticket)
	meta.elapsedMs = 120
	var log: String = codec.encode(terminal, meta)
	a.truth(codec.restore(log).ok, "duration regression uses valid real terminal replay")
	for elapsed in [0, 121]:
		a.equal(service.request("alice", "settle", {"ticketId": start.ticket.id, "log": log, "elapsedMs": elapsed}).code, "INVALID_DURATION", "outer elapsed must equal frozen log " + str(elapsed))
	a.equal(service.request("alice", "bootstrap", {}).data.history.records, [], "duration mismatch cannot publish a result")
	for field in ["userId", "mode", "day", "dealHash", "expiresAt"]:
		var assigned: Dictionary = service.request("alice", "start", {"mode": "tutorial"}).data
		var altered := _meta(assigned.ticket)
		altered.elapsedMs = 120
		if field == "expiresAt":
			altered.ticket[field] += 1
		else:
			altered.ticket[field] = "tampered"
		var altered_log: String = codec.encode(_win(assigned.deal, assigned.ticket.id), altered)
		a.truth(codec.restore(altered_log).ok, "ticket regression codec accepts independently valid metadata " + field)
		a.equal(service.request("alice", "settle", {"ticketId": assigned.ticket.id, "log": altered_log, "elapsedMs": 120}).code, "TICKET_MISMATCH", "frozen ticket must match assigned ticket " + field)
	var accepted: Dictionary = service.request("alice", "settle", {"ticketId": start.ticket.id, "log": log, "elapsedMs": 120})
	a.truth(accepted.ok, "matching frozen duration and assigned ticket accepted")
	if accepted.ok:
		a.equal(accepted.data.result.elapsedMs, 120, "accepted duration is frozen terminal duration")
	now = start.ticket.expiresAt
	var retried: Dictionary = service.request("alice", "settle", {"ticketId": start.ticket.id, "log": log, "elapsedMs": 120})
	a.truth(retried.ok, "exact accepted frozen metadata still retries across midnight")
	if retried.ok:
		a.equal(retried.data.replayed, true, "frozen metadata validation preserves accepted-first result")
	now = wall_before
	return true

func _collation(a) -> bool:
	var wall_before := now
	now = 1790956800000
	var store := Memory.new()
	var service = _service(store)
	var real_results: Array = []
	for user in ["Zed", "alice"]:
		var start: Dictionary = service.request(user, "start", {"mode": "daily"}).data
		var settled: Dictionary = service.request(user, "settle", _payload(start))
		a.truth(settled.ok, "real equal-time honor contender " + user)
		if settled.ok:
			real_results.append(settled.data.result)
	now = Catalog.next_reset(now)
	var honors: Dictionary = service.request("alice", "bootstrap", {}).data.honors
	for category in ["first", "fast", "king"]:
		a.equal(honors[category].userId, "alice", "source locale honor tie Zed/alice " + category)
	# These unit inputs derive from genuinely replayed service results. Time
	# changes stay local to the helper test and are never persisted as records.
	var earlier := real_results.duplicate(true)
	earlier[0].endedAt -= 1
	a.equal(service._honor(earlier, false).userId, "Zed", "first honor preserves endedAt priority")
	a.equal(service._honor(earlier, true).userId, "Zed", "equal elapsed honors preserve endedAt priority")
	var quicker := real_results.duplicate(true)
	quicker[0].elapsedMs = 1
	quicker[1].elapsedMs = 2
	quicker[0].endedAt += 100
	a.equal(service._honor(quicker, true).userId, "Zed", "fast honor preserves elapsed priority over end time")
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/service/id-collation.json"))
	a.equal(oracle.resolvedOptions.locale, "zh-CN", "captured source default collation locale")
	a.equal(oracle.resolvedOptions.numeric, false, "source ID ordering uses lexical digits")
	if not service.has_method("_compare_user_ids"):
		a.truth(false, "source-compatible ASCII identifier comparison exists")
		now = wall_before
		return true
	for i in range(oracle.alphabet.length()):
		for j in range(oracle.alphabet.length()):
			a.equal(service._compare_user_ids(oracle.alphabet[i], oracle.alphabet[j]), oracle.characterSigns[i][j], "source ASCII pair " + oracle.alphabet[i] + "/" + oracle.alphabet[j])
	for i in range(oracle.samples.size()):
		for j in range(oracle.samples.size()):
			a.equal(service._compare_user_ids(oracle.samples[i], oracle.samples[j]), oracle.sampleSigns[i][j], "source case/punctuation/prefix pair " + oracle.samples[i] + "/" + oracle.samples[j])
	now = wall_before
	return true

func _payload(start: Dictionary) -> Dictionary:
	return {"ticketId": start.ticket.id, "log": codec.encode(_win(start.deal, start.ticket.id), _meta(start.ticket)), "elapsedMs": 0}

func _meta(ticket: Dictionary) -> Dictionary:
	return {"scope": "local", "ticket": ticket, "elapsedMs": 0, "settlementPending": true}

func _win(deal: Dictionary, id: String) -> Dictionary:
	var state := Round.create(deal, id)
	var ids: Array = []
	if deal.cells.size() == 12:
		for cell in deal.cells:
			ids.append(cell.id)
	else:
		for scenario in witness.cases:
			if scenario.name.begins_with("developer-acceptance-receipt-") and scenario.deal.dealId == deal.dealId:
				for step in scenario.steps:
					ids.append(step.action.id)
	for tile in ids:
		state = Round.dispatch(state, {"id": "pick-" + str(state.revision), "roundId": id, "expectedRevision": state.revision, "type": "PICK", "tileId": tile}).state
	return state

func _lose(deal: Dictionary, id: String) -> Dictionary:
	var state := Round.create(deal, id)
	while state.board.status == "PLAYING":
		var tiles := Board.legal_tiles(state.board)
		if tiles.is_empty():
			break
		state = Round.dispatch(state, {"id": "lose-" + str(state.revision), "roundId": id, "expectedRevision": state.revision, "type": "PICK", "tileId": tiles[0]}).state
	return state

func _tie(a) -> bool:
	var store := Memory.new()
	var service = _service(store)
	var day := Catalog.cycle(now)
	var alice_team := ("alice:" + day).sha256_text().left(8).hex_to_int() % 2
	var opposite := ""
	for i in range(100):
		var user := "opponent" + str(i)
		if (user + ":" + day).sha256_text().left(8).hex_to_int() % 2 != alice_team:
			opposite = user
			break
	for user in ["alice", opposite]:
		var start: Dictionary = service.call(user, "start", {"mode": "topic"}).data
		a.truth(service.call(user, "settle", _payload(start)).ok, "real topic tie participant settles")
	now = Catalog.next_reset(now)
	a.equal(service.call("alice", "bootstrap", {}).data.topic.previousScores, [1, 1], "yesterday real tie")
	a.equal(service.call("alice", "bootstrap", {}).data.profile.owned, ["plain"], "strict tie does not unlock scarf")
	var loss_start: Dictionary = service.call("alice", "start", {"mode": "daily"}).data
	var loss := _lose(loss_start.deal, loss_start.ticket.id)
	a.truth(service.call("alice", "settle", {"ticketId": loss_start.ticket.id, "log": codec.encode(loss, _meta(loss_start.ticket)), "elapsedMs": 0}).ok, "no pending real loss settles")
	a.equal(service.call("alice", "bootstrap", {}).data.today.failures, 1, "real daily failure recorded")
	a.equal(service.call("alice", "bootstrap", {}).data.totals, {"wins": 0, "attempts": 1}, "loss counts attempt without contribution")
	return true
