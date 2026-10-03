extends RefCounted

const Graph = preload("res://rules/blocker_graph.gd")
const Canonical = preload("res://rules/canonical_json.gd")

static func reject(code: String) -> Dictionary:
	return {"ok": false, "code": code, "deal": {}}

static func load_deal(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return reject("DEAL_NOT_FOUND")
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return reject("DEAL_READ_FAILED")
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK or not json.data is Dictionary:
		return reject("INVALID_DEAL_JSON")
	return validate_deal(json.data)

static func validate_deal(deal: Dictionary) -> Dictionary:
	if deal.get("schema") != "astra-deal-1":
		return reject("INVALID_SNAPSHOT_SCHEMA")
	if not Graph.nonempty(deal.get("dealId")):
		return reject("INVALID_DEAL_ID")
	if deal.get("slotCapacity") != 7:
		return reject("RUNTIME_REQUIRES_SEVEN_SLOTS")
	if deal.has("origin") and not Graph.nonempty(deal.origin):
		return reject("INVALID_ORIGIN")
	if not Graph.nonempty(deal.get("layoutId")):
		return reject("INVALID_LAYOUT")
	var graph := Graph.build(deal)
	if not graph.ok:
		return reject(graph.code)
	var counts := {}
	for c in deal.cells:
		if not Graph.nonempty(c.get("type")):
			return reject("INVALID_TYPE")
		counts[c.type] = counts.get(c.type, 0) + 1
	for count in counts.values():
		if count % 3 != 0:
			return reject("UNBALANCED_TYPES")
	if deal.has("snapshotHash"):
		var hash_value: Variant = deal.snapshotHash
		if not hash_value is String or hash_value.length() != 64:
			return reject("INVALID_SNAPSHOT_HASH")
		for c in hash_value:
			if not c in "0123456789abcdef":
				return reject("INVALID_SNAPSHOT_HASH")
		if Canonical.snapshot_hash(deal) != hash_value:
			return reject("SNAPSHOT_HASH_MISMATCH")
	return {"ok": true, "code": "VALID_DEAL", "deal": deal.duplicate(true)}
