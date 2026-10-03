extends RefCounted

# Independent local development service. Reward observations are not platform
# evidence; this file provides no authentication or remote transport.
const Catalog = preload("res://services/catalog.gd")
const Canonical = preload("res://rules/canonical_json.gd")
const Codec = preload("res://storage/round_codec.gd")
const VERSION := "godot-social-v1"
const KEY := "social"
var _store: RefCounted
var _wall_now: Callable
var _db: Dictionary = {}
var _load_code := "NOT_CONFIGURED"

func configure(store: RefCounted, wall_now: Callable) -> void:
	_store = store
	_wall_now = wall_now
	_db = {"version": VERSION, "serial": 0, "users": {}, "tickets": {}, "results": {}, "bullets": []}
	var saved: Dictionary = _store.read(KEY)
	_load_code = "OK"
	if not saved.ok:
		if saved.code != "MISSING":
			_load_code = saved.code
		return
	var parser := JSON.new()
	if parser.parse(saved.text) != OK:
		_load_code = "INVALID_SOCIAL_SAVE"
		return
	var parsed: Variant = parser.data
	if not _valid_database(parsed):
		_load_code = "INVALID_SOCIAL_SAVE"
		return
	_db = parsed

@warning_ignore("native_method_override")
func call(user_id: StringName, ...arguments: Array) -> Variant:
	if arguments.size() < 1 or arguments.size() > 2 or not arguments[0] is String:
		return _failure("INVALID_PAYLOAD")
	if arguments.size() == 2 and not arguments[1] is Dictionary:
		return _failure("INVALID_PAYLOAD")
	return request(str(user_id), arguments[0], arguments[1] if arguments.size() == 2 else {})

# Object.call is native when the receiver is statically typed. Typed callers
# use this alias; the documented call(user, action, data) facade is dynamic.
func request(user_id: String, action: String, data: Dictionary = {}) -> Dictionary:
	if _load_code != "OK":
		return _failure(_load_code)
	if not _valid_id(user_id):
		return _failure("INVALID_USER")
	if action not in ["bootstrap", "start", "settle", "equip", "bullet"]:
		return _failure("UNKNOWN_ACTION")
	var now: int = _wall_now.call()
	var day := Catalog.cycle(now)
	if day.is_empty():
		return _failure("INVALID_CLOCK")
	if not _db.users.has(user_id):
		var draft := _db.duplicate(true)
		draft.users[user_id] = {"id": user_id, "name": "本地玩家", "region": Catalog.regions()[0], "skin": "plain", "owned": ["plain"], "tutorialDone": false, "createdAt": now}
		var ensured := _commit(draft, {})
		if not ensured.ok:
			return ensured
	match action:
		"bootstrap":
			return _bootstrap(user_id, now)
		"start":
			var mode: Variant = data.get("mode")
			if mode not in ["tutorial", "daily", "topic"]:
				return _failure("INVALID_MODE")
			var deal := Catalog.mode_deal(day, mode)
			var draft := _db.duplicate(true)
			draft.serial += 1
			var id := "r-" + str(now) + "-" + str(draft.serial) + "-" + user_id.sha256_text().left(10)
			var ticket := {"id": id, "userId": user_id, "mode": mode, "day": day, "createdAt": now, "expiresAt": Catalog.next_reset(now), "dealId": deal.dealId, "dealHash": Canonical.snapshot_hash(deal), "index": Catalog.deal_index(day, mode), "region": draft.users[user_id].region}
			draft.tickets[id] = ticket
			return _commit(draft, {"ticket": ticket, "deal": deal})
		"settle":
			return _settle(user_id, data, now)
		"equip":
			var skin: Variant = data.get("skin")
			var valid := false
			for choice in Catalog.skins():
				if choice.id == skin:
					valid = true
			if not valid:
				return _failure("INVALID_SKIN")
			if skin not in _db.users[user_id].owned:
				return _failure("SKIN_LOCKED")
			var draft := _db.duplicate(true)
			draft.users[user_id].skin = skin
			var saved := _commit(draft, {})
			return _bootstrap(user_id, now) if saved.ok else saved
		"bullet":
			var preset: Dictionary = {}
			for choice in Catalog.bullets():
				if choice.id == data.get("id"):
					preset = choice
			if preset.is_empty():
				return _failure("INVALID_BULLET")
			var draft := _db.duplicate(true)
			draft.serial += 1
			draft.bullets.append({"id": "b" + str(draft.serial), "preset": preset.id, "text": preset.text, "day": day, "time": now, "userId": user_id, "name": draft.users[user_id].name})
			if draft.bullets.size() > 100:
				draft.bullets = draft.bullets.slice(-100)
			var saved := _commit(draft, {})
			return _bootstrap(user_id, now) if saved.ok else saved
	return _failure("UNKNOWN_ACTION")

func _settle(user_id: String, data: Dictionary, now: int) -> Dictionary:
	var id: Variant = data.get("ticketId")
	if not id is String or not _db.tickets.has(id):
		return _failure("TICKET_UNKNOWN")
	var ticket: Dictionary = _db.tickets[id]
	if ticket.userId != user_id:
		return _failure("TICKET_OWNER")
	if data.size() != 3 or not data.has("log") or not data.has("elapsedMs") or not data.log is String:
		return _failure("INVALID_PAYLOAD")
	# Hash the original envelope bytes and frozen duration, before expiry/replay.
	var signature := Canonical.encode([id, data.log, data.elapsedMs]).sha256_text()
	if _db.results.has(id):
		if _db.results[id].signature != signature:
			return _failure("SETTLEMENT_CONFLICT")
		return _success({"replayed": true, "result": _db.results[id]})
	if ticket.day != Catalog.cycle(now) or now >= ticket.expiresAt:
		return _failure("CYCLE_EXPIRED")
	if not _integer(data.elapsedMs) or data.elapsedMs < 0 or data.elapsedMs > maxi(0, now - int(ticket.createdAt)) + 1500:
		return _failure("INVALID_DURATION")
	var replay := Codec.restore(data.log)
	if not replay.ok:
		return _failure("LOG_REJECTED:" + replay.code)
	if replay.meta.elapsedMs != data.elapsedMs:
		return _failure("INVALID_DURATION")
	var state: Dictionary = replay.state
	var assigned := Catalog.mode_deal(ticket.day, ticket.mode)
	if state.roundId != id or state.initialDeal.dealId != assigned.dealId or Canonical.snapshot_hash(state.initialDeal) != ticket.dealHash or ticket.dealHash != Canonical.snapshot_hash(assigned):
		return _failure("DEAL_MISMATCH")
	if Canonical.encode(replay.meta.ticket) != Canonical.encode(ticket):
		return _failure("TICKET_MISMATCH")
	if state.board.status not in ["WON", "LOST"] or state.pending != null:
		return _failure("NOT_TERMINAL")
	var draft := _db.duplicate(true)
	var result := {"ticketId": id, "userId": user_id, "region": ticket.region, "day": ticket.day, "mode": ticket.mode, "status": state.board.status, "elapsedMs": data.elapsedMs, "endedAt": now, "used": state.used, "signature": signature, "rewardVerification": "development_observations_only", "revenueCny": null}
	draft.results[id] = result
	if result.status == "WON":
		if ticket.mode == "tutorial":
			draft.users[user_id].tutorialDone = true
		if ticket.mode == "daily" and "cap" not in draft.users[user_id].owned:
			draft.users[user_id].owned.append("cap")
	return _commit(draft, {"replayed": false, "result": result})

func _bootstrap(user_id: String, now: int) -> Dictionary:
	var day := Catalog.cycle(now)
	var yesterday := Catalog.cycle(now - Catalog.DAY_MS)
	var previous := _topic_scores(yesterday)
	var team := _group(user_id, yesterday)
	var previous_winners := _winners(yesterday, "topic")
	if previous[team] > previous[1 - team] and previous_winners.has(user_id) and "scarf" not in _db.users[user_id].owned:
		var draft := _db.duplicate(true)
		draft.users[user_id].owned.append("scarf")
		var saved := _commit(draft, {})
		if not saved.ok:
			return saved
	var daily := _winners(day, "daily").values()
	var results: Array = _db.results.values()
	var own_results: Array = []
	var today: Array = []
	var daily_dates: Dictionary = {}
	var records: Array = []
	var attempts := 0
	for result in results:
		if result.day == day and result.mode == "daily":
			attempts += 1
		if result.userId == user_id:
			own_results.append(result)
			records.push_front({"day": result.day, "mode": result.mode, "status": result.status, "elapsedMs": result.elapsedMs})
			if result.mode == "daily":
				if result.day == day:
					today.append(result)
				if result.status == "WON":
					daily_dates[result.day] = true
	var regions: Array = []
	for name in Catalog.regions():
		var regional_wins := 0
		var regional_attempts := 0
		for result in daily:
			if result.region == name:
				regional_wins += 1
		for result in results:
			if result.day == day and result.mode == "daily" and result.region == name:
				regional_attempts += 1
		regions.append({"name": name, "wins": regional_wins, "attempts": regional_attempts})
	var region_order := Catalog.regions()
	regions.sort_custom(func(x, y): return x.wins > y.wins if x.wins != y.wins else region_order.find(x.name) < region_order.find(y.name))
	var skins := Catalog.skins()
	for skin in skins:
		skin.owned = skin.id in _db.users[user_id].owned
	var bullets: Array = []
	for bullet in _db.bullets:
		if bullet.day == day:
			bullets.append(bullet)
	var yw: Array = []
	var no_assist: Array = []
	for result in results:
		if result.day == yesterday and result.mode == "daily" and result.status == "WON":
			yw.append(result)
			if result.used.values().all(func(value): return value == 0):
				no_assist.append(result)
	var failures := 0
	var won := false
	for result in today:
		failures += 1 if result.status == "LOST" else 0
		won = won or result.status == "WON"
	return _success({"dataMode": "development_local", "policy": Catalog.policy(), "day": day, "nextReset": Catalog.next_reset(now), "profile": _db.users[user_id], "regions": regions, "totals": {"wins": daily.size(), "attempts": attempts}, "today": {"won": won, "failures": failures}, "topic": {"id": "local-topic-" + day, "title": "早起派与夜猫派", "sampleContent": true, "labels": ["早起派", "夜猫派"], "team": _group(user_id, day), "scores": _topic_scores(day), "won": _winners(day, "topic").has(user_id), "previousScores": previous}, "honors": {"day": yesterday, "first": _honor(yw, false), "fast": _honor(yw, true), "king": _honor(no_assist, true)}, "skins": skins, "history": {"wins": daily_dates.size(), "records": records}, "bullets": bullets.slice(-12), "presetBullets": Catalog.bullets()})

func _honor(results: Array, fastest: bool) -> Variant:
	if results.is_empty():
		return null
	var ordered := results.duplicate()
	ordered.sort_custom(func(x, y):
		if fastest and x.elapsedMs != y.elapsedMs:
			return x.elapsedMs < y.elapsedMs
		if x.endedAt != y.endedAt:
			return x.endedAt < y.endedAt
		return _compare_user_ids(x.userId, y.userId) < 0)
	var best: Dictionary = ordered[0]
	return {"userId": best.userId, "name": _db.users[best.userId].name, "region": best.region, "elapsedMs": best.elapsedMs, "endedAt": best.endedAt}

# Matches the captured Node default zh-CN collation in the service's validated
# ASCII ID domain. Primary punctuation/digit/lowercase order comes first;
# letter case is compared only when the complete primary strings are equal.
# This deliberately retains lexical digit order (a10 precedes a2) and does
# not claim arbitrary Unicode, locale-specific contractions, or ICU support.
func _compare_user_ids(left: String, right: String) -> int:
	const PRIMARY := "_-.0123456789abcdefghijklmnopqrstuvwxyz"
	var left_primary := left.to_lower()
	var right_primary := right.to_lower()
	for i in range(mini(left_primary.length(), right_primary.length())):
		var a := PRIMARY.find(left_primary[i])
		var b := PRIMARY.find(right_primary[i])
		if a != b:
			return -1 if a < b else 1
	if left_primary.length() != right_primary.length():
		return -1 if left_primary.length() < right_primary.length() else 1
	for i in range(left.length()):
		var left_lower := left[i] == left_primary[i]
		var right_lower := right[i] == right_primary[i]
		if left_lower != right_lower:
			return -1 if left_lower else 1
	return 0

func _winners(day: String, mode: String) -> Dictionary:
	var found: Dictionary = {}
	for result in _db.results.values():
		if result.day == day and result.mode == mode and result.status == "WON" and not found.has(result.userId):
			found[result.userId] = result
	return found

func _topic_scores(day: String) -> Array:
	var scores := [0, 0]
	for user_id in _winners(day, "topic"):
		scores[_group(user_id, day)] += 1
	return scores

func _group(user_id: String, day: String) -> int:
	return (user_id + ":" + day).sha256_text().left(8).hex_to_int() % 2

func _commit(draft: Dictionary, data: Dictionary) -> Dictionary:
	# Preserve result insertion order, including equal endedAt timestamps, so
	# reloading the local database retains the source personal history order.
	var saved: Dictionary = _store.write(KEY, JSON.stringify(draft, "", false))
	if not saved.ok:
		return _failure(saved.code)
	_db = draft
	return _success(data)

func _integer(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) == floor(float(value)) and absf(float(value)) <= 9007199254740991.0

func _valid_database(value: Variant) -> bool:
	if not value is Dictionary or value.get("version") != VERSION or not value.get("users") is Dictionary or not value.get("tickets") is Dictionary or not value.get("results") is Dictionary or not value.get("bullets") is Array or not _integer(value.get("serial")) or value.serial < 0 or value.bullets.size() > 100:
		return false
	var regions := Catalog.regions()
	for id in value.users:
		var user: Variant = value.users[id]
		if not id is String or not _valid_id(id) or not user is Dictionary or user.get("id") != id or not user.get("name") is String or user.get("region") not in regions or user.get("skin") not in ["plain", "cap", "scarf"] or not user.get("owned") is Array or not user.get("tutorialDone") is bool or not _integer(user.get("createdAt")):
			return false
		if "plain" not in user.owned or user.skin not in user.owned:
			return false
		for skin in user.owned:
			if skin not in ["plain", "cap", "scarf"]:
				return false
	for id in value.tickets:
		var ticket: Variant = value.tickets[id]
		if not ticket is Dictionary or ticket.get("id") != id or not value.users.has(ticket.get("userId")) or ticket.get("mode") not in ["tutorial", "daily", "topic"] or not ticket.get("day") is String or Catalog.deal_index(ticket.day, ticket.mode) < 0 or not _integer(ticket.get("createdAt")) or not _integer(ticket.get("expiresAt")) or ticket.get("region") not in regions or not ticket.get("dealId") is String or not ticket.get("dealHash") is String or ticket.dealHash.length() != 64 or ticket.get("index") != Catalog.deal_index(ticket.day, ticket.mode):
			return false
	for id in value.results:
		var result: Variant = value.results[id]
		if not result is Dictionary or not value.tickets.has(id) or result.get("ticketId") != id or result.get("userId") != value.tickets[id].userId or result.get("day") != value.tickets[id].day or result.get("mode") != value.tickets[id].mode or result.get("region") != value.tickets[id].region or result.get("status") not in ["WON", "LOST"] or not _integer(result.get("elapsedMs")) or result.elapsedMs < 0 or not _integer(result.get("endedAt")) or not result.get("signature") is String or result.signature.length() != 64 or not result.get("used") is Dictionary or result.used.size() != 4:
			return false
		for assist in ["move", "undo", "shuffle", "revive"]:
			if not _integer(result.used.get(assist)) or result.used[assist] < 0 or result.used[assist] > 1:
				return false
	for bullet in value.bullets:
		if not bullet is Dictionary or not bullet.get("id") is String or not bullet.get("preset") is String or not bullet.get("text") is String or not bullet.get("day") is String or not _integer(bullet.get("time")) or not value.users.has(bullet.get("userId")) or not bullet.get("name") is String:
			return false
	return true

func _valid_id(id: String) -> bool:
	if id.is_empty() or id.length() > 80 or id in ["__proto__", "constructor", "prototype"]:
		return false
	for ch in id:
		if ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-":
			return false
	return true

func _success(data: Dictionary) -> Dictionary:
	return {"ok": true, "code": "OK", "data": data.duplicate(true)}

func _failure(code: String) -> Dictionary:
	return {"ok": false, "code": code, "data": {}}
