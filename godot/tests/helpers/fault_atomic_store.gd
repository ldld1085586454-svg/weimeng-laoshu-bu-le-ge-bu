extends "res://storage/atomic_store.gd"

var fail_at: String = ""

func _scan_versions(key: String) -> Dictionary:
	if fail_at == "scan":
		var files: Array[String] = []
		return {"ok": false, "files": files}
	return super._scan_versions(key)

func _init(namespace_path: String) -> void:
	super(namespace_path)

func _write_file_bytes(path: String, bytes: PackedByteArray) -> Error:
	if fail_at == "write" and path.ends_with(".tmp"):
		return ERR_FILE_CANT_WRITE
	return super._write_file_bytes(path, bytes)

func _read_file_bytes(path: String) -> Dictionary:
	if fail_at == "read":
		return {"ok": false, "code": "READ_FAILED", "bytes": PackedByteArray()}
	if fail_at == "verify" and path.ends_with(".tmp"):
		return {"ok": true, "code": "OK", "bytes": "corrupted".to_utf8_buffer()}
	return super._read_file_bytes(path)

func _replace_file(source: String, destination: String) -> Error:
	if fail_at == "rename_source_lost":
		DirAccess.remove_absolute(source)
		return super._replace_file(source, destination)
	if fail_at == "replace":
		return ERR_FILE_CANT_WRITE
	return super._replace_file(source, destination)
