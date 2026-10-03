extends RefCounted

const Catalog = preload("res://services/catalog.gd")

func run(a: RefCounted) -> bool:
	var cases: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/catalog-cases.json"))
	for vector in cases.times:
		var wall_ms := int(vector.wallMs)
		a.equal(Catalog.cycle(wall_ms), vector.cycle, "JS UTC+8 cycle " + str(wall_ms))
		a.equal(Catalog.next_reset(wall_ms), int(vector.nextReset), "JS UTC+8 reset " + str(wall_ms))
		a.truth(Catalog.next_reset(wall_ms) > wall_ms, "reset lies strictly in future " + str(wall_ms))
	for vector in cases.indices:
		a.equal(Catalog.deal_index(vector.day, vector.mode), int(vector.index), "JS SHA256 deal " + vector.day + ":" + vector.mode)
	var int64_min: int = -9223372036854775807 - 1
	for invalid_wall in [int64_min, 9223372036854775807, -62167248000001, 253402271999999 + 1]:
		a.equal(Catalog.cycle(invalid_wall), "", "out of YYYY-MM-DD range rejected " + str(invalid_wall))
		a.equal(Catalog.next_reset(invalid_wall), -1, "invalid timestamp has no reset " + str(invalid_wall))
	for day in ["", "2026-2-03", "2026-02-30", "2023-02-29", "1900-02-29", "2026-13-01", "2026-00-01", "2026-01-00", "2026-01-32", "2026-10-03T00:00:00Z", "2026-10-03 ", "abcdefghij"]:
		a.equal(Catalog.deal_index(day, "daily"), -1, "invalid day rejected " + day)
		a.equal(Catalog.mode_deal(day, "tutorial"), {}, "invalid day cannot bypass validation for tutorial " + day)
	for mode in ["", "DAILY", "practice", "daily "]:
		a.equal(Catalog.deal_index("2026-10-03", mode), -1, "invalid mode rejected " + mode)
		a.equal(Catalog.mode_deal("2026-10-03", mode), {}, "invalid mode cannot select a deal " + mode)
	a.equal(Catalog.policy(), cases.catalog.POLICY, "source policy exact")
	a.equal(Catalog.regions(), cases.catalog.REGIONS, "source regions ordered")
	a.equal(Catalog.skins(), cases.catalog.SKINS, "source skins and sheep labels preserved")
	a.equal(Catalog.bullets(), cases.catalog.BULLETS, "six preset bullets exact")
	a.equal(Catalog.profile(), JSON.parse_string(FileAccess.get_file_as_string("res://data/profile.json")), "source profile exact")
	a.equal(Catalog.limits(), {"move": 1, "undo": 1, "shuffle": 1, "revive": 1}, "one use per assist")
	a.equal(Catalog.tutorial(), cases.tutorial, "exact twelve tutorial rows and metadata")
	a.equal(Catalog.tutorial().get("cells", []).size(), 12, "tutorial twelve cards")
	for index in range(3):
		var size: int = [270, 540, 720][index]
		var expected: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/deals/deal-" + str(size) + ".json"))
		a.equal(Catalog.get_deal(index), expected, "deal order " + str(size))
		a.equal(Catalog.get_deal(index).get("cells", []).size(), size, "deal size " + str(size))
	for index in [-1, 3, 999]:
		a.equal(Catalog.get_deal(index), {}, "invalid deal index rejected " + str(index))
	for vector in cases.indices.slice(0, 21):
		var expected: Dictionary = cases.tutorial if vector.mode == "tutorial" else Catalog.get_deal(int(vector.index))
		a.equal(Catalog.mode_deal(vector.day, vector.mode), expected, "mode resolves source deal " + vector.day + ":" + vector.mode)
	var policy := Catalog.policy()
	policy.version = "mutated"
	a.equal(Catalog.policy(), cases.catalog.POLICY, "policy detached copy")
	var regions := Catalog.regions()
	if not regions.is_empty():
		regions[0] = "mutated"
	a.equal(Catalog.regions(), cases.catalog.REGIONS, "regions detached copy")
	var skins := Catalog.skins()
	if not skins.is_empty():
		skins[0].name = "mutated"
	a.equal(Catalog.skins(), cases.catalog.SKINS, "skins nested detached copy")
	var bullets := Catalog.bullets()
	if not bullets.is_empty():
		bullets[0].text = "mutated"
	a.equal(Catalog.bullets(), cases.catalog.BULLETS, "bullets nested detached copy")
	var profile := Catalog.profile()
	profile.get("undoSources", []).append("side")
	a.equal(Catalog.profile().get("undoSources"), ["board"], "profile nested detached copy")
	var limits := Catalog.limits()
	limits.move = 5
	a.equal(Catalog.limits().get("move"), 1, "limits detached copy")
	var tutorial := Catalog.tutorial()
	if not tutorial.get("cells", []).is_empty():
		tutorial.cells[0].rect.x = 999
	a.equal(Catalog.tutorial(), cases.tutorial, "tutorial nested detached copy")
	var deal := Catalog.get_deal(0)
	if not deal.get("cells", []).is_empty():
		deal.cells[0].type = "mutated"
	a.equal(Catalog.get_deal(0), JSON.parse_string(FileAccess.get_file_as_string("res://data/deals/deal-270.json")), "fixed deal nested detached copy")
	return true
