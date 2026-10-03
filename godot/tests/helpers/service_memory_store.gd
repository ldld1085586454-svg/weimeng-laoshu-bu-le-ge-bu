extends RefCounted

var records: Dictionary = {}
var fail_key := ""
var fail_count := 0

func read(key: String) -> Dictionary:
	return {"ok": true, "code": "OK", "text": records[key]} if records.has(key) else {"ok": false, "code": "MISSING", "text": ""}

func write(key: String, text: String) -> Dictionary:
	if key == fail_key and fail_count > 0:
		fail_count -= 1
		return {"ok": false, "code": "WRITE_FAILED"}
	records[key] = text
	return {"ok": true, "code": "OK"}
