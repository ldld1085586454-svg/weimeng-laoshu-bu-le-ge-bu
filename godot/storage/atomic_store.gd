extends RefCounted

const MAX_BYTES: int = 8 * 1024 * 1024
const DEFAULT_NAMESPACE := "user://bu_le_ge_bu_godot_v1/"

var _namespace: String

func _init(namespace_path: String = DEFAULT_NAMESPACE) -> void:
	_namespace = namespace_path

func read(key: String) -> Dictionary:
	if not _valid_key(key):
		return _read_failure("INVALID_KEY")
	var scan := _scan_versions(key)
	if not scan.ok:
		return _read_failure("READ_FAILED")
	var versions: Array[String] = scan.files
	if versions.is_empty():
		return _read_failure("MISSING")
	var path := _namespace.path_join(versions[-1])
	var result := _read_file_bytes(path)
	if not result.ok:
		return _read_failure(result.code)
	var bytes: PackedByteArray = result.bytes
	var text := bytes.get_string_from_utf8()
	if text.to_utf8_buffer() != bytes:
		return _read_failure("INVALID_UTF8")
	return {"ok": true, "code": "OK", "text": text}

func write(key: String, text: String) -> Dictionary:
	if not _valid_key(key):
		return _failure("INVALID_KEY")
	var bytes := text.to_utf8_buffer()
	if bytes.size() > MAX_BYTES:
		return _failure("TOO_LARGE")
	if DirAccess.make_dir_recursive_absolute(_namespace) != OK or not DirAccess.dir_exists_absolute(_namespace):
		return _failure("MKDIR_FAILED")
	var scan := _scan_versions(key)
	if not scan.ok:
		return _failure("WRITE_FAILED")
	var versions: Array[String] = scan.files
	var generation: int = 1 if versions.is_empty() else _generation(versions[-1], key) + 1
	if generation > 9999999999999999:
		return _failure("VERSION_LIMIT")
	var path := _namespace.path_join(key + ".%016d.committed" % generation)
	var temporary := path + ".tmp"
	if _write_file_bytes(temporary, bytes) != OK:
		return _failure("WRITE_FAILED")
	if not _verified(temporary, bytes):
		return _failure("VERIFY_FAILED")
	# Windows Godot deletes an existing rename destination before moving the
	# source. Commit to a NEW generation instead: one rename atomically makes
	# it authoritative while every old generation remains intact on failure.
	if FileAccess.file_exists(path):
		return _failure("REPLACE_FAILED")
	if _replace_file(temporary, path) != OK:
		return _failure("REPLACE_FAILED")
	# Retain the previous completed version. Cleanup is after commit and never
	# changes the authoritative result; a locked old file can be cleaned later.
	for index in range(maxi(0, versions.size() - 1)):
		DirAccess.remove_absolute(_namespace.path_join(versions[index]))
	return {"ok": true, "code": "OK"}

func _scan_versions(key: String) -> Dictionary:
	var found: Array[String] = []
	if not DirAccess.dir_exists_absolute(_namespace):
		return {"ok": not FileAccess.file_exists(_namespace), "files": found}
	var directory := DirAccess.open(_namespace)
	if directory == null:
		return {"ok": false, "files": found}
	if directory.list_dir_begin() != OK:
		return {"ok": false, "files": found}
	var file := directory.get_next()
	while not file.is_empty():
		if not directory.current_is_dir() and file.begins_with(key + ".") and file.ends_with(".committed") and file.length() == key.length() + 27:
			var digits := file.substr(key.length() + 1, 16)
			if digits.is_valid_int() and digits == "%016d" % int(digits) and int(digits) > 0:
				found.append(file)
		file = directory.get_next()
	directory.list_dir_end()
	found.sort()
	return {"ok": true, "files": found}

func _generation(file: String, key: String) -> int:
	return int(file.substr(key.length() + 1, 16))

func _valid_key(key: String) -> bool:
	if key.is_empty() or key.length() > 128 or key.contains("..") or key.ends_with("."):
		return false
	if key.to_lower().ends_with(".tmp") or key.to_lower().ends_with(".bak"):
		return false
	for index in range(key.length()):
		var ch := key.unicode_at(index)
		var alphanumeric := (ch >= 48 and ch <= 57) or (ch >= 97 and ch <= 122)
		if not alphanumeric and (index == 0 or ch not in [45, 46, 95]):
			return false
	# Windows device names remain reserved with an extension.
	var stem := key.get_slice(".", 0).to_upper()
	if stem in ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"]:
		return false
	if stem.length() == 4 and (stem.begins_with("COM") or stem.begins_with("LPT")) and stem[3] in "123456789":
		return false
	return true

func _verified(path: String, expected: PackedByteArray) -> bool:
	var actual := _read_file_bytes(path)
	return actual.ok and actual.bytes == expected

# Small overridable filesystem boundaries also permit deterministic failure
# tests against the real filesystem without altering normal product behavior.
func _write_file_bytes(path: String, bytes: PackedByteArray) -> Error:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_buffer(bytes)
	file.flush()
	var error := file.get_error()
	file.close()
	return error

func _read_file_bytes(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {"ok": false, "code": "READ_FAILED", "bytes": PackedByteArray()}
	var size := file.get_length()
	if size > MAX_BYTES:
		file.close()
		return {"ok": false, "code": "TOO_LARGE", "bytes": PackedByteArray()}
	var bytes := file.get_buffer(size)
	var error := file.get_error()
	file.close()
	if bytes.size() != size or error != OK:
		return {"ok": false, "code": "READ_FAILED", "bytes": PackedByteArray()}
	return {"ok": true, "code": "OK", "bytes": bytes}

func _replace_file(source: String, destination: String) -> Error:
	return DirAccess.rename_absolute(source, destination)

func _failure(code: String) -> Dictionary:
	return {"ok": false, "code": code}

func _read_failure(code: String) -> Dictionary:
	return {"ok": false, "code": code, "text": ""}
