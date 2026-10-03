extends RefCounted

var records: Dictionary = {}
var fail: bool = false
var writes: int = 0
var on_write: Callable

func read(key: String) -> Dictionary:
	return {"ok": records.has(key), "code": "OK" if records.has(key) else "MISSING", "text": records.get(key, "")}

func write(key: String, text: String) -> Dictionary:
	writes += 1
	if on_write.is_valid():
		on_write.call()
	if fail:
		return {"ok": false, "code": "WRITE_FAILED"}
	records[key] = text
	return {"ok": true, "code": "OK"}
