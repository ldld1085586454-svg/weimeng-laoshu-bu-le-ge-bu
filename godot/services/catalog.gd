extends RefCounted

# Reference configuration is read from the Task 1 copies. No JS or local timezone
# participates in runtime selection; callers receive detached nested values.
const OFFSET_MS := 480 * 60000
const DAY_MS := 86400000
const DEAL_SIZES := [270, 540, 720]
const MODES := ["tutorial", "daily", "topic"]
# Inclusive wall times whose UTC+8 date fits the YYYY-MM-DD public contract.
const MIN_WALL_MS := -62167248000000
const MAX_WALL_MS := 253402271999999

static func cycle(wall_ms: int) -> String:
	if wall_ms < MIN_WALL_MS or wall_ms > MAX_WALL_MS:
		return ""
	var date := Time.get_datetime_dict_from_unix_time(_floor_div(wall_ms + OFFSET_MS, 1000))
	return "%04d-%02d-%02d" % [date.year, date.month, date.day]

static func next_reset(wall_ms: int) -> int:
	if wall_ms < MIN_WALL_MS or wall_ms > MAX_WALL_MS:
		return -1
	return (_floor_div(wall_ms + OFFSET_MS, DAY_MS) + 1) * DAY_MS - OFFSET_MS

# Invalid input returns a sentinel instead of silently selecting a source deal.
# The tutorial ticket still carries the same deterministic index as JS social.js,
# although its playable deal always comes from tutorial.json.
static func deal_index(day: String, mode: String) -> int:
	if not _valid_day(day) or mode not in MODES:
		return -1
	return (day + ":" + mode).sha256_text().left(8).hex_to_int() % DEAL_SIZES.size()

static func policy() -> Dictionary:
	return _load_dictionary("res://data/catalog.json").get("POLICY", {}).duplicate(true)

static func regions() -> Array:
	return _load_dictionary("res://data/catalog.json").get("REGIONS", []).duplicate(true)

static func skins() -> Array:
	return _load_dictionary("res://data/catalog.json").get("SKINS", []).duplicate(true)

static func bullets() -> Array:
	return _load_dictionary("res://data/catalog.json").get("BULLETS", []).duplicate(true)

static func profile() -> Dictionary:
	return _load_dictionary("res://data/profile.json")

static func limits() -> Dictionary:
	return _load_dictionary("res://data/limits.json")

static func tutorial() -> Dictionary:
	return _load_dictionary("res://data/deals/tutorial.json")

static func get_deal(index: int) -> Dictionary:
	if index < 0 or index >= DEAL_SIZES.size():
		return {}
	return _load_dictionary("res://data/deals/deal-" + str(DEAL_SIZES[index]) + ".json")

static func mode_deal(day: String, mode: String) -> Dictionary:
	var index := deal_index(day, mode)
	if index < 0:
		return {}
	return tutorial() if mode == "tutorial" else get_deal(index)

static func _load_dictionary(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("Catalog data unreadable: " + path)
		return {}
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK or not json.data is Dictionary:
		push_error("Catalog data is not a JSON object: " + path)
		return {}
	return json.data.duplicate(true)

static func _floor_div(value: int, divisor: int) -> int:
	@warning_ignore("integer_division")
	var quotient := value / divisor
	return quotient - 1 if value < 0 and value % divisor != 0 else quotient

static func _valid_day(day: String) -> bool:
	if day.length() != 10 or day[4] != "-" or day[7] != "-":
		return false
	for i in [0, 1, 2, 3, 5, 6, 8, 9]:
		if day[i] not in "0123456789":
			return false
	var year := day.left(4).to_int()
	var month := day.substr(5, 2).to_int()
	var date := day.right(2).to_int()
	if month < 1 or month > 12 or date < 1:
		return false
	var month_days := [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
	if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
		month_days[1] = 29
	return date <= month_days[month - 1]
