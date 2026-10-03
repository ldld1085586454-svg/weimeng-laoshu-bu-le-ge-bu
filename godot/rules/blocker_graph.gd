extends RefCounted

const MAX_CELLS := 3000
const MAX_COORDINATE := 1000000

static func integer(value: Variant) -> bool:
	return (value is int or value is float) and value >= -9007199254740991 and value <= 9007199254740991 and is_finite(float(value)) and value == floor(float(value))

static func nonempty(value: Variant) -> bool:
	return value is String and not value.strip_edges().is_empty()

static func reject(code: String) -> Dictionary:
	return {"ok": false, "code": code, "parents": [], "children": [], "by_id": {}}

static func overlaps(a: Dictionary, b: Dictionary) -> bool:
	return a.x < b.x + b.w and a.x + a.w > b.x and a.y < b.y + b.h and a.y + a.h > b.y

static func build(deal: Dictionary) -> Dictionary:
	if not nonempty(deal.get("layoutId", deal.get("id"))) or not deal.get("cells") is Array or deal.cells.is_empty():
		return reject("INVALID_LAYOUT")
	if deal.cells.size() > MAX_CELLS:
		return reject("LAYOUT_LIMIT")
	var by_id := {}
	var stacks := {}
	var parents: Array = []
	var children: Array = []
	for i in range(deal.cells.size()):
		var c: Variant = deal.cells[i]
		if not c is Dictionary or not nonempty(c.get("id")) or by_id.has(c.id):
			return reject("DUPLICATE_OR_INVALID_ID")
		by_id[c.id] = i
		var rect: Variant = c.get("rect")
		if not rect is Dictionary:
			return reject("INVALID_RECT")
		for key in ["x", "y", "w", "h"]:
			if not integer(rect.get(key)):
				return reject("INVALID_RECT")
		if rect.w <= 0 or rect.h <= 0:
			return reject("INVALID_RECT")
		for key in ["x", "y", "w", "h"]:
			if rect[key] < -MAX_COORDINATE or rect[key] > MAX_COORDINATE:
				return reject("COORDINATE_LIMIT")
		if c.get("zone") == "board":
			if not integer(c.get("z")):
				return reject("INVALID_LAYER")
		elif c.get("zone") == "side":
			if not nonempty(c.get("stackId")) or not integer(c.get("position")) or c.position < 0:
				return reject("INVALID_STACK")
			if not stacks.has(c.stackId):
				stacks[c.stackId] = []
			stacks[c.stackId].append(c.position)
		else:
			return reject("INVALID_ZONE")
		parents.append([])
		children.append([])
	for positions in stacks.values():
		positions.sort()
		for i in range(positions.size()):
			if positions[i] != i:
				return reject("STACK_GAP_OR_DUPLICATE_POSITION")
	for i in range(deal.cells.size()):
		var a: Dictionary = deal.cells[i]
		for j in range(i + 1, deal.cells.size()):
			var b: Dictionary = deal.cells[j]
			var intersects := overlaps(a.rect, b.rect)
			if intersects:
				if a.zone != b.zone:
					return reject("MIXED_ZONE_INTERSECTION")
				if a.zone == "board" and a.z == b.z:
					return reject("AMBIGUOUS_SAME_LAYER_OVERLAP")
				if a.zone == "side" and a.stackId != b.stackId:
					return reject("STACK_INTERSECTION")
			var from := -1
			var to := -1
			if a.zone == "board" and b.zone == "board" and intersects:
				from = i if a.z > b.z else j
				to = j if a.z > b.z else i
			elif a.zone == "side" and b.zone == "side" and a.stackId == b.stackId:
				if a.position == b.position - 1:
					from = i
					to = j
				elif b.position == a.position - 1:
					from = j
					to = i
			if from >= 0:
				parents[to].append(from)
				children[from].append(to)
	return {"ok": true, "code": "VALID_LAYOUT", "parents": parents, "children": children, "by_id": by_id}
