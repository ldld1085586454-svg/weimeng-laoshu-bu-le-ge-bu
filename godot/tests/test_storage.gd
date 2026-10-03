extends RefCounted

const MAX_BYTES := 8 * 1024 * 1024

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://storage/atomic_store.gd"):
		a.truth(false, "atomic store implementation exists")
		return true
	var script = load("res://storage/atomic_store.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "atomic store loads")
		return true
	var temporary := DirAccess.create_temp("bu-le-ge-store-test")
	a.truth(temporary != null, "isolated temporary directory created")
	if temporary == null:
		return true
	var root: String = temporary.get_current_dir()
	var store = script.new(root.path_join("nested"))
	a.equal(store.read("active").code, "MISSING", "missing primary does not fabricate save")
	a.equal(store.read("active").text, "", "read failure includes empty text")
	var original := "{\"title\":\"卜了个卜\",\"elapsedMs\":125}"
	a.equal(store.write("active", original), {"ok": true, "code": "OK"}, "nested namespace and UTF-8 save write")
	a.equal(store.read("active"), {"ok": true, "code": "OK", "text": original}, "read exact saved text")
	a.truth(store.write("active", "second").ok, "replacement succeeds")
	a.equal(FileAccess.get_file_as_string(root.path_join("nested/active.0000000000000001.committed")), original, "previous completed version retained")
	a.truth(store.write("active", "third").ok, "successive replacement succeeds")
	a.equal(store.read("active").text, "third", "latest primary selected")
	a.equal(FileAccess.get_file_as_string(root.path_join("nested/active.0000000000000002.committed")), "second", "backup advances one completed version")
	a.equal(DirAccess.get_files_at(root.path_join("nested")).size(), 2, "successful saves retain only current and previous generations")
	for key in ["", ".", "..", "../escape", "a/b", "a\\b", "C:escape", "a..b", "save.tmp", "save.bak", "CON", "nul.json", "name.", "a".repeat(129)]:
		a.equal(store.write(key, "bad").code, "INVALID_KEY", "unsafe write key " + key.left(25))
		a.equal(store.read(key).code, "INVALID_KEY", "unsafe read key " + key.left(25))
	var case_store = script.new(root.path_join("case-contract"))
	a.equal(case_store.write("Active", "uppercase-save").code, "INVALID_KEY", "uppercase key is rejected before creating an inaccessible generation")
	a.equal(case_store.read("Active").code, "INVALID_KEY", "uppercase reads share the lowercase key contract")
	a.truth(case_store.write("active", "lowercase-save").ok, "lowercase key remains usable after uppercase rejection")
	a.equal(case_store.read("active").text, "lowercase-save", "lowercase save does not collide with rejected uppercase generation")
	a.truth(store.write("round-01.json", "").ok, "safe dotted key and empty text accepted")
	a.equal(store.read("round-01.json").text, "", "empty file is valid")
	var limit_text := "x".repeat(MAX_BYTES)
	a.truth(store.write("limit", limit_text).ok, "exact 8 MiB boundary accepted")
	a.equal(store.write("limit", limit_text + "x").code, "TOO_LARGE", "one byte over limit rejected")
	a.equal(store.read("limit").text.length(), MAX_BYTES, "oversize write leaves primary untouched")
	a.equal(store.write("unicode-limit", "卜".repeat(MAX_BYTES / 3 + 1)).code, "TOO_LARGE", "limit counts UTF-8 bytes instead of characters")
	_write_bytes(root.path_join("nested/oversize.0000000000000001.committed"), (limit_text + "x").to_utf8_buffer())
	a.equal(store.read("oversize").code, "TOO_LARGE", "oversize file rejected before parsing")
	_write_bytes(root.path_join("nested/interrupted.tmp"), "uncommitted".to_utf8_buffer())
	_write_bytes(root.path_join("nested/interrupted.bak"), "previous".to_utf8_buffer())
	a.equal(store.read("interrupted").code, "MISSING", "orphan tmp and backup never restored automatically")
	_write_bytes(root.path_join("nested/active.tmp"), "uncommitted".to_utf8_buffer())
	_write_bytes(root.path_join("nested/active.9999999999999999.committed.tmp"), "uncommitted future generation".to_utf8_buffer())
	a.equal(store.read("active").text, "third", "orphan tmp cannot override primary")
	a.truth(store.write("corrupt", "valid-previous").ok, "corrupt latest test previous save")
	a.truth(store.write("corrupt", "current").ok, "corrupt latest test current save")
	_write_bytes(root.path_join("nested/corrupt.0000000000000002.committed"), (limit_text + "x").to_utf8_buffer())
	a.equal(store.read("corrupt"), {"ok": false, "code": "TOO_LARGE", "text": ""}, "corrupt newest generation returns error rather than restoring old save")
	a.equal(FileAccess.get_file_as_string(root.path_join("nested/corrupt.0000000000000001.committed")), "valid-previous", "corrupt newest does not destroy diagnostic backup")
	_write_bytes(root.path_join("blocked"), "ordinary-file".to_utf8_buffer())
	var blocked = script.new(root.path_join("blocked"))
	a.equal(blocked.write("active", "candidate").code, "MKDIR_FAILED", "namespace creation failure is reported")
	var fault_script = load("res://tests/helpers/fault_atomic_store.gd")
	if fault_script == null or not fault_script.can_instantiate():
		a.truth(false, "fault injection helper loads")
		return true
	var unreadable = fault_script.new(root.path_join("unreadable"))
	a.truth(unreadable.write("active", "saved").ok, "read failure seed")
	unreadable.fail_at = "read"
	a.equal(unreadable.read("active"), {"ok": false, "code": "READ_FAILED", "text": ""}, "read failure consistently returns empty text")
	var scan_failure = fault_script.new(root.path_join("scan-failure"))
	a.truth(scan_failure.write("active", "valid-before").ok, "scan failure seed")
	scan_failure.fail_at = "scan"
	a.equal(scan_failure.read("active"), {"ok": false, "code": "READ_FAILED", "text": ""}, "directory scan failure is not a missing save")
	a.equal(scan_failure.write("active", "candidate"), {"ok": false, "code": "WRITE_FAILED"}, "directory scan failure prevents candidate writing")
	a.equal(DirAccess.get_files_at(root.path_join("scan-failure")).size(), 1, "scan failure does not create even an uncommitted candidate")
	scan_failure.fail_at = ""
	a.equal(scan_failure.read("active").text, "valid-before", "scan failure preserves completed save")
	for boundary in ["write", "verify", "replace", "rename_source_lost"]:
		var fault_store = fault_script.new(root.path_join(boundary))
		a.truth(fault_store.write("active", "valid-before").ok, boundary + " seed")
		fault_store.fail_at = boundary
		var failed: Dictionary = fault_store.write("active", "candidate")
		a.equal(failed.ok, false, boundary + " reports failure")
		a.equal(failed.code, {"write": "WRITE_FAILED", "verify": "VERIFY_FAILED", "replace": "REPLACE_FAILED", "rename_source_lost": "REPLACE_FAILED"}[boundary], boundary + " has actionable code")
		fault_store.fail_at = ""
		a.equal(fault_store.read("active").text, "valid-before", boundary + " leaves old primary intact")
		a.truth(fault_store.write("active", "retry").ok, boundary + " can retry failed operation")
		a.equal(fault_store.read("active").text, "retry", boundary + " retry publishes exact candidate")
	return true

func _write_bytes(path: String, bytes: PackedByteArray) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_buffer(bytes)
	file.close()
