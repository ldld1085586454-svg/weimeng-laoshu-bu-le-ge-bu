extends RefCounted

# A platform implementation must report launch failures through this signal,
# correlated to the same round/token that entered WAITING.
signal result(event: Dictionary)

func launch(request: Dictionary) -> void:
	_emit_result(request, "failed")

func cancel() -> void:
	pass

static func valid_request(request: Dictionary) -> bool:
	if request.size() != 4:
		return false
	for key in ["roundId", "token", "assist", "channel"]:
		if not request.has(key) or not request[key] is String or request[key].strip_edges().is_empty():
			return false
	return request.assist in ["move", "undo", "shuffle", "revive"] and request.channel in ["video", "share"]

func _emit_result(request: Dictionary, kind: String, extra: Dictionary = {}) -> void:
	var event := {"roundId": request.get("roundId", ""), "token": request.get("token", ""), "kind": kind}
	event.merge(extra, true)
	result.emit(event)
