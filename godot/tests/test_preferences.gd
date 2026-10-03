extends RefCounted

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://ui/preferences.gd"):
		a.truth(false, "preferences implementation exists")
		return true
	var script = load("res://ui/preferences.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "preferences implementation loads")
		return true
	var temporary := DirAccess.create_temp("bu-le-ge-prefs-test")
	a.truth(temporary != null, "preferences isolated storage created")
	if temporary == null:
		return true
	var store = load("res://storage/atomic_store.gd").new(temporary.get_current_dir())
	var preferences = script.new()
	var defaults: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/default-prefs.json"))
	a.equal(preferences.defaults(), defaults, "defaults match imported preference configuration")
	a.equal(preferences.load(store), {"ok": true, "code": "DEFAULTS", "prefs": defaults}, "first launch has defaults without claiming a saved file")
	a.equal(store.read("prefs").code, "MISSING", "loading defaults never writes a fabricated save")
	var wanted := defaults.duplicate()
	wanted.music = false
	wanted.reducedMotion = true
	a.equal(preferences.save(store, wanted), {"ok": true, "code": "OK", "prefs": wanted}, "all five exact boolean settings save transactionally")
	a.equal(script.new().load(store), {"ok": true, "code": "OK", "prefs": wanted}, "restart restores committed preferences")
	wanted.sound = false
	a.equal(script.new().load(store).prefs.sound, true, "returned preferences are detached from persisted value")
	var faulty = load("res://tests/helpers/fault_atomic_store.gd").new(temporary.get_current_dir())
	faulty.fail_at = "replace"
	var previous: Dictionary = preferences.load(store).prefs
	var candidate := previous.duplicate()
	candidate.vibration = false
	a.equal(preferences.save(faulty, candidate), {"ok": false, "code": "REPLACE_FAILED", "prefs": previous}, "failed replacement returns prior values for settings rollback")
	a.equal(script.new().save(faulty, candidate), {"ok": false, "code": "REPLACE_FAILED", "prefs": previous}, "fresh preferences instance obtains prior committed values before a failed save")
	a.equal(script.new().load(store).prefs, previous, "failed replacement leaves old values on disk")
	faulty.fail_at = ""
	a.truth(preferences.save(faulty, candidate).ok, "failed preference write can retry")
	for invalid in [ {}, {"music": true}, _with(candidate, "sound", 1), _with(candidate, "bullets", "true"), _with(candidate, "extra", true) ]:
		a.equal(preferences.save(store, invalid), {"ok": false, "code": "INVALID_PREFS", "prefs": candidate}, "invalid candidate cannot change committed preferences")
	for corrupt_text in ["{", "null", "[]", "{}", JSON.stringify(_with(defaults, "music", 1)), JSON.stringify(_with(defaults, "unknown", false))]:
		a.truth(store.write("prefs", corrupt_text).ok, "seed malformed preferences")
		var restored: Dictionary = script.new().load(store)
		a.equal(restored.ok, false, "corrupt saved preferences are reported explicitly")
		a.equal(restored.prefs, defaults, "corrupt saved preferences safely use defaults")
		a.truth(restored.code in ["INVALID_JSON", "INVALID_PREFS"], "corrupt saved preferences have useful diagnosis")
		a.equal(store.read("prefs").text, corrupt_text, "failed restore preserves diagnostics rather than silently overwriting")
	a.truth(store.write("prefs", " ".repeat(4097)).ok, "seed bounded oversized preference JSON")
	a.equal(script.new().load(store), {"ok": false, "code": "TOO_LARGE", "prefs": defaults}, "preferences reject oversized JSON before parsing")
	faulty.fail_at = "read"
	a.equal(script.new().load(faulty), {"ok": false, "code": "READ_FAILED", "prefs": defaults}, "read failure is distinguishable from a missing preference file")
	return true

func _with(value: Dictionary, key: String, item: Variant) -> Dictionary:
	var changed := value.duplicate()
	changed[key] = item
	return changed
