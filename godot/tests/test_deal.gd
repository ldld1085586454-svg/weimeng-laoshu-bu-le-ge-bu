extends RefCounted

const Graph = preload("res://rules/blocker_graph.gd")
const Loader = preload("res://rules/deal_loader.gd")
const Canonical = preload("res://rules/canonical_json.gd")

func cell(id: String, x: Variant, z: int = 0) -> Dictionary:
	return {"id": id, "type": "T00", "zone": "board", "z": z, "rect": {"x": x, "y": 0, "w": 10, "h": 10}}

func layout(cells: Array) -> Dictionary:
	return {"layoutId": "test", "cells": cells}

func run(a: RefCounted) -> bool:
	var g := Graph.build(layout([cell("a", 0), cell("b", 10)]))
	a.truth(g.ok, "edge contact accepted")
	a.equal(g.parents, [[], []], "edge contact does not block")
	g = Graph.build(layout([cell("a", 0), cell("b", 9, 2)]))
	a.equal(g.parents, [[1], []], "high z blocks low z")
	a.equal(g.children, [[], [0]], "high z children")
	a.equal(g.by_id, {"a": 0, "b": 1}, "id maps to source index")
	a.equal(Graph.build(layout([cell("a", 0), cell("b", 9)])).code, "AMBIGUOUS_SAME_LAYER_OVERLAP", "same layer rejected")
	var sides := []
	for i in range(3):
		var c := cell("s" + str(i), i * 20)
		c.erase("z")
		c.merge({"zone": "side", "stackId": "left", "position": i}, true)
		sides.append(c)
	g = Graph.build(layout(sides))
	a.equal(g.parents, [[], [0], [1]], "side only adjacent positions block even without overlap")
	var mixed: Dictionary = sides[0].duplicate(true)
	mixed.id = "mixed"
	a.equal(Graph.build(layout([cell("a", 0), mixed])).code, "MIXED_ZONE_INTERSECTION", "mixed zone intersection rejected")
	var other: Dictionary = mixed.duplicate(true)
	other.id = "other"
	other.stackId = "right"
	a.equal(Graph.build(layout([mixed, other])).code, "STACK_INTERSECTION", "different stacks intersection rejected")
	a.equal(Graph.build(layout([cell("a", 0.5)])).code, "INVALID_RECT", "fractional rectangle rejected")
	var int64_min: int = -9223372036854775807 - 1
	a.equal(Graph.integer(int64_min), false, "INT64_MIN is outside JavaScript safe integer range")
	a.equal(Graph.build(layout([cell("a", int64_min)])).code, "INVALID_RECT", "INT64_MIN geometry rejected before bounds arithmetic")
	a.equal(Graph.build(layout([cell("a", -1000001)])).code, "COORDINATE_LIMIT", "negative coordinate bound enforced")
	other = sides[1].duplicate(true)
	other.position = 3
	a.equal(Graph.build(layout([sides[0], other])).code, "STACK_GAP_OR_DUPLICATE_POSITION", "stack gap rejected")
	a.equal(Canonical.encode({"z": [true, null, "中文"], "a": 7.0}), '{"a":7,"z":[true,null,"中文"]}', "sorted stable JSON and integer floats")
	for n in [270, 540, 720]:
		var loaded := Loader.load_deal("res://data/deals/deal-" + str(n) + ".json")
		a.truth(loaded.ok, "load " + str(n))
		if loaded.ok:
			a.equal(loaded.deal.cells.size(), n, "tile count " + str(n))
			a.equal(loaded.deal.slotCapacity, 7, "seven slots " + str(n))
			a.equal(Canonical.snapshot_hash(loaded.deal), loaded.deal.snapshotHash, "source content hash " + str(n))
			a.truth(Graph.build(loaded.deal).ok, "valid full graph " + str(n))
		var receipt_path := "res://data/deals/deal-" + str(n) + ".receipt.json"
		a.truth(FileAccess.file_exists(receipt_path), "receipt witness " + str(n))
	for f in ["home.png", "board.png", "characters.png", "components.png", "primary.png", "user-cards.png", "manifest.json", "user-cards-index.json", "fonts/ZCOOLKuaiLe-Regular.ttf", "fonts/OFL.txt"]:
		a.truth(FileAccess.file_exists("res://assets/theme/" + f), "required theme " + f)
	for f in ["click", "clear", "win", "fail", "music"]:
		a.truth(FileAccess.file_exists("res://assets/audio/" + f + ".wav"), "required audio " + f)
	for f in ["catalog", "profile", "limits", "default-prefs", "source-manifest"]:
		a.truth(FileAccess.file_exists("res://data/" + f + ".json"), "explicit data " + f)
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/source-manifest.json"))
	a.equal(manifest.sourceCommit, "362c61027b7a7f7e573f4b28608e3b3098e2092a", "fixed source revision")
	for entry in manifest.files:
		var path: String = "res://" + entry.destination
		a.truth(FileAccess.file_exists(path), "provenance file " + entry.destination)
		var ctx := HashingContext.new()
		ctx.start(HashingContext.HASH_SHA256)
		ctx.update(FileAccess.get_file_as_bytes(path))
		a.equal(ctx.finish().hex_encode(), entry.sha256, "provenance SHA256 " + entry.destination)
	var audit: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/font-audit.json"))
	a.equal(audit.headingMissing, [], "all source UI Han glyphs covered")
	a.equal(audit.fallbackRequired, false, "font fallback unnecessary")
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/oracle.json"))
	for vector in oracle.canonicalVectors:
		a.equal(Canonical.encode(vector.value), vector.encoded, "JS canonical encoding")
		a.equal(Canonical.encode(vector.value).sha256_text(), vector.sha256, "JS canonical hash")
	for expected in oracle.deals:
		var loaded := Loader.load_deal("res://data/deals/deal-" + str(int(expected.size)) + ".json")
		if loaded.ok:
			var graph := Graph.build(loaded.deal)
			a.equal(graph.parents, expected.parents, "source oracle parents " + str(expected.size))
			a.equal(graph.children, expected.children, "source oracle children " + str(expected.size))
			a.equal(graph.by_id, expected.by_id, "source oracle ids " + str(expected.size))
			a.equal(Canonical.snapshot_hash(loaded.deal), expected.snapshotHash, "source oracle content hash " + str(expected.size))
	var tutorial := Loader.load_deal("res://data/deals/tutorial.json")
	a.truth(tutorial.ok, "tutorial loaded")
	if tutorial.ok:
		a.equal(tutorial.deal.cells.size(), 12, "tutorial has twelve cards")
		var altered: Dictionary = tutorial.deal.duplicate(true)
		altered.slotCapacity = 8
		a.equal(Loader.validate_deal(altered).code, "RUNTIME_REQUIRES_SEVEN_SLOTS", "reject wrong slot capacity")
		altered = tutorial.deal.duplicate(true)
		altered.snapshotHash = "0".repeat(64)
		a.equal(Loader.validate_deal(altered).code, "SNAPSHOT_HASH_MISMATCH", "reject mismatching content hash")
		altered = tutorial.deal.duplicate(true)
		altered.cells[0].type = "different"
		a.equal(Loader.validate_deal(altered).code, "UNBALANCED_TYPES", "reject unbalanced types")
		altered = tutorial.deal.duplicate(true)
		altered.erase("layoutId")
		altered.id = "raw-layout-fallback"
		a.equal(Loader.validate_deal(altered).code, "INVALID_LAYOUT", "snapshot requires layoutId even when id exists")
	return true
