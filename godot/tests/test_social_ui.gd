extends RefCounted

const Service = preload("res://services/local_game_service.gd")
const Memory = preload("res://tests/helpers/service_memory_store.gd")
const Catalog = preload("res://services/catalog.gd")
const Round = preload("res://rules/round_reducer.gd")
const Board = preload("res://rules/board_reducer.gd")
const Codec = preload("res://storage/round_codec.gd")
var now := 1790956800000

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://ui/social_presenter.gd"):
		a.truth(false, "social presenter exists")
		return true
	var script = load("res://ui/social_presenter.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "social presenter loads")
		return true
	var presenter = script.new()
	var memory := Memory.new()
	var service := Service.new()
	service.configure(memory, func(): return now)
	var response: Dictionary = service.request("social-ui-player", "bootstrap", {})
	a.truth(response.ok, "real local bootstrap succeeds")
	var info: Dictionary = response.data
	var before := info.duplicate(true)
	for page in ["rank", "friends", "topic", "honor", "profile", "wardrobe", "club", "bullet", "about"]:
		var model: Dictionary = presenter.render(info, page)
		a.equal(model.keys().size(), 4, page + " stable four-field page model")
		a.truth(model.title is String and model.subtitle is String and model.rows is Array and model.actions is Array, page + " page schema")
		a.truth(model.subtitle.contains("本地开发数据"), page + " local scope explicit")
		for row in model.rows:
			a.truth(row.text is String and row.detail is String, page + " readable row schema")
		for action in model.actions:
			a.truth(action.id is String and action.label is String and action.enabled is bool, page + " actionable schema")
			a.truth(action.id == "topic-start" or action.id.begins_with("equip:") or action.id.begins_with("send-bullet:"), page + " no unsupported profile mutation")
	a.equal(info, before, "rendering never changes bootstrap authority")
	var rank: Dictionary = presenter.render(info, "rank")
	a.equal(rank.rows.size(), info.regions.size(), "every actual region represented without fabricated players")
	for index in range(info.regions.size()):
		a.truth(rank.rows[index].text.contains(info.regions[index].name), "rank follows real region order " + str(index))
		a.equal(rank.rows[index].detail, "通关 0 · 挑战 0", "empty real regional counts " + str(index))
	for page in ["friends", "club"]:
		var model: Dictionary = presenter.render(info, page)
		a.equal(model.rows.size(), 1, page + " no fake social members")
		a.truth(model.rows[0].text.contains("未接入"), page + " unavailable integration clear")
		a.equal(model.rows[0].disabled, true, page + " unsupported row disabled")
		a.equal(model.actions, [], page + " no unsupported mutation")
	var honor: Dictionary = presenter.render(info, "honor")
	a.equal(honor.rows.size(), 3, "three real honor slots")
	for row in honor.rows:
		a.truth(row.detail.contains("暂无"), "empty honor has no invented winner")
		a.equal(row.disabled, true, "empty honor disabled")
	var wardrobe: Dictionary = presenter.render(info, "wardrobe")
	a.equal(wardrobe.actions, [{"id": "equip:plain", "label": "已装备", "enabled": false}, {"id": "equip:cap", "label": "装备小黄帽萝卜", "enabled": false}, {"id": "equip:scarf", "label": "装备围巾萝卜", "enabled": false}], "real initial ownership controls equip actions")
	for row in wardrobe.rows:
		a.truth(row.text.contains("萝卜") and not row.text.contains("羊"), "skin display has approved radish identity")
	a.truth(wardrobe.subtitle.contains("草帽") and wardrobe.subtitle.contains("围巾") and not wardrobe.subtitle.contains("占位"), "wardrobe explains implemented visual variants without stale placeholder claim")
	var about: Dictionary = presenter.render(info, "about")
	a.equal(about.rows[0].text, "卜了个卜", "about page uses actual game name")
	a.truth(about.rows[3].text.contains("角色动画") and not about.rows[3].detail.contains("尚未提供"), "about page describes shipped character animations")
	var topic: Dictionary = presenter.render(info, "topic")
	a.equal(topic.rows[0].text, info.topic.title, "topic title comes from bootstrap")
	a.truth(topic.rows[1].text.contains(info.topic.labels[0]), "first topic camp exact bootstrap label")
	a.truth(topic.rows[2].text.contains(info.topic.labels[1]), "second topic camp exact bootstrap label")
	a.equal(topic.actions, [{"id": "topic-start", "label": "参加话题挑战", "enabled": true}], "real topic action routes to service")
	var bullet: Dictionary = presenter.render(info, "bullet")
	a.equal(bullet.rows.size(), 6, "six actual preset rows when no sent messages")
	a.equal(bullet.actions.size(), 6, "six actual preset actions")
	for index in range(info.presetBullets.size()):
		var preset: Dictionary = info.presetBullets[index]
		a.equal(bullet.rows[index].text, preset.text, "preset preserves source text " + preset.id)
		a.equal(bullet.actions[index], {"id": "send-bullet:" + preset.id, "label": preset.text, "enabled": true}, "preset preserves real id " + preset.id)
	a.truth(service.request("social-ui-player", "bullet", {"id": info.presetBullets[0].id}).ok, "real bullet action persists")
	info = service.request("social-ui-player", "bootstrap", {}).data
	bullet = presenter.render(info, "bullet")
	a.equal(bullet.rows.size(), 7, "actual sent bullet added after presets")
	a.truth(bullet.rows[6].text.contains(info.bullets[0].text) and bullet.rows[6].text.contains(info.profile.name), "sent bullet uses actual stored sender and text")
	# Real reducer/replay settlement: tutorial victory, then an actual daily loss.
	var start: Dictionary = service.request("social-ui-player", "start", {"mode": "tutorial"}).data
	var won := Round.create(start.deal, start.ticket.id)
	for cell in start.deal.cells:
		won = _pick(won, cell.id)
	a.equal(won.board.status, "WON", "real tutorial play terminal witness")
	a.truth(_settle(service, start.ticket, won, 61234).ok, "real tutorial history settled")
	start = service.request("social-ui-player", "start", {"mode": "daily"}).data
	var lost := Round.create(start.deal, start.ticket.id)
	while lost.board.status == "PLAYING":
		lost = _pick(lost, Board.legal_tiles(lost.board)[0])
	a.equal(lost.board.status, "LOST", "real daily loss terminal witness")
	a.truth(_settle(service, start.ticket, lost, 1234).ok, "real daily loss history settled")
	info = service.request("social-ui-player", "bootstrap", {}).data
	var profile: Dictionary = presenter.render(info, "profile")
	a.equal(profile.rows.size(), 5, "profile fields plus exactly two real records")
	a.equal(profile.rows[3].text, info.history.records[0].day + " · 每日挑战", "latest actual history mode and day")
	a.equal(profile.rows[3].detail, "失败 · 用时 1.234秒", "actual loss status and millisecond duration")
	a.equal(profile.rows[4].detail, "胜利 · 用时 1分01.234秒", "actual tutorial duration preserved")
	# Settle a real daily witness to earn cap, then actual topic witness for scarf.
	var fixtures: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/board_cases.json"))
	for mode in ["daily", "topic"]:
		start = service.request("social-ui-player", "start", {"mode": mode}).data
		won = Round.create(start.deal, start.ticket.id)
		for scenario in fixtures.cases:
			if scenario.name.begins_with("developer-acceptance-receipt-") and scenario.deal.dealId == start.deal.dealId:
				for step in scenario.steps:
					won = _pick(won, step.action.id)
				break
		a.equal(won.board.status, "WON", "real " + mode + " victory witness")
		a.truth(_settle(service, start.ticket, won, 2345).ok, "real " + mode + " victory settles")
	info = service.request("social-ui-player", "bootstrap", {}).data
	rank = presenter.render(info, "rank")
	for index in range(info.regions.size()):
		a.equal(rank.rows[index].detail, "通关 " + str(info.regions[index].wins) + " · 挑战 " + str(info.regions[index].attempts), "settled regional counters mapped " + str(index))
	a.truth(rank.rows[0].detail.contains("通关 1"), "real victorious region rises to first position")
	profile = presenter.render(info, "profile")
	a.equal(profile.rows.size(), 3 + info.history.records.size(), "all actual settled history records mapped")
	for index in range(info.history.records.size()):
		var record: Dictionary = info.history.records[index]
		a.truth(profile.rows[index + 3].text.ends_with(presenter.MODE_NAMES[record.mode]), "all real history modes mapped " + str(index))
		a.truth(profile.rows[index + 3].detail.begins_with(presenter.STATUS_NAMES[record.status]), "all real history statuses mapped " + str(index))
	wardrobe = presenter.render(info, "wardrobe")
	a.equal(wardrobe.actions[1].enabled, true, "actual daily win unlocks cap action")
	a.equal(wardrobe.actions[2].enabled, false, "today topic does not unlock yesterday scarf")
	a.truth(service.request("social-ui-player", "equip", {"skin": "cap"}).ok, "actual unlocked cap equip succeeds")
	info = service.request("social-ui-player", "bootstrap", {}).data
	wardrobe = presenter.render(info, "wardrobe")
	a.equal(wardrobe.actions[1].enabled, false, "current actual equipment disabled")
	a.equal(wardrobe.actions[0].enabled, true, "owned alternative equipment enabled")
	topic = presenter.render(info, "topic")
	a.equal(topic.rows[1].detail, "通关 " + str(info.topic.scores[0]), "actual first camp scores")
	a.equal(topic.rows[2].detail, "通关 " + str(info.topic.scores[1]), "actual second camp scores")
	now = Catalog.next_reset(now)
	info = service.request("social-ui-player", "bootstrap", {}).data
	wardrobe = presenter.render(info, "wardrobe")
	a.equal(wardrobe.actions[2].enabled, true, "actual yesterday winning camp unlocks scarf action")
	honor = presenter.render(info, "honor")
	for row in honor.rows:
		a.truth(row.detail.contains(info.profile.name) and row.detail.contains(info.profile.region) and row.detail.contains("2.345秒"), "honor uses real settled player's identity and duration")
		a.equal(row.disabled, false, "real honor populated")
	var unavailable: Dictionary = presenter.render({}, "topic")
	a.equal(unavailable.actions[0].enabled, false, "missing bootstrap cannot start invented topic")
	unavailable = presenter.render({}, "bullet")
	a.equal(unavailable.actions, [], "missing bootstrap cannot invent presets")
	a.truth(unavailable.rows[0].detail.contains("暂无"), "empty bullets explained")
	a.equal(presenter.render(info, "unsupported").actions, [], "unknown page cannot create actions")
	return true

func _pick(state: Dictionary, id: String) -> Dictionary:
	return Round.dispatch(state, {"id": "pick-" + str(state.revision), "roundId": state.roundId, "expectedRevision": state.revision, "type": "PICK", "tileId": id}).state

func _settle(service: RefCounted, ticket: Dictionary, state: Dictionary, elapsed: int) -> Dictionary:
	now += elapsed
	var metadata := {"scope": "local", "ticket": ticket, "elapsedMs": elapsed, "settlementPending": true}
	return service.request("social-ui-player", "settle", {"ticketId": ticket.id, "log": Codec.encode(state, metadata), "elapsedMs": elapsed})
