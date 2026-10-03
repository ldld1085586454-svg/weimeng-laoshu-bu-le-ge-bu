extends RefCounted

const KEY := "prefs"
const MAX_BYTES := 4096
const DEFAULTS := {"music": true, "sound": true, "vibration": true, "bullets": true, "reducedMotion": false}

var _prefs: Dictionary = DEFAULTS.duplicate()
var _loaded := false

func defaults() -> Dictionary:
	return DEFAULTS.duplicate()

func load(store: RefCounted) -> Dictionary:
	var stored: Dictionary = store.read(KEY)
	_loaded = true
	_prefs = defaults()
	if not stored.ok:
		return _result(stored.code == "MISSING", "DEFAULTS" if stored.code == "MISSING" else stored.code)
	var text: String = stored.text
	if text.to_utf8_buffer().size() > MAX_BYTES:
		return _result(false, "TOO_LARGE")
	var parser := JSON.new()
	if parser.parse(text) != OK:
		return _result(false, "INVALID_JSON")
	if not _valid(parser.data):
		return _result(false, "INVALID_PREFS")
	_prefs = parser.data.duplicate()
	return _result(true, "OK")

func save(store: RefCounted, prefs: Dictionary) -> Dictionary:
	if not _loaded:
		self.load(store)
	if not _valid(prefs):
		return _result(false, "INVALID_PREFS")
	var saved: Dictionary = store.write(KEY, JSON.stringify(prefs))
	if not saved.ok:
		return _result(false, saved.code)
	_prefs = prefs.duplicate()
	return _result(true, "OK")

func _valid(value: Variant) -> bool:
	if not value is Dictionary or value.size() != DEFAULTS.size():
		return false
	for key in DEFAULTS:
		if not value.has(key) or typeof(value[key]) != TYPE_BOOL:
			return false
	return true

func _result(ok: bool, code: String) -> Dictionary:
	return {"ok": ok, "code": code, "prefs": _prefs.duplicate()}
