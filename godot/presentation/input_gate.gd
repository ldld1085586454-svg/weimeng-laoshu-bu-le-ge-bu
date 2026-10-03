extends RefCounted

# Board gestures only. Modal controls use their own input handlers; the host
# supplies the combined modal/busy/loading/animation/settlement board lock.
var _capture: Dictionary = {}
var _down_pointers: Dictionary = {}
var _board_locked: bool = false

func press(pointer_id: int, target_id: String, round_id: String) -> void:
	if round_id.is_empty() or _down_pointers.has(pointer_id):
		return
	if not _down_pointers.is_empty() and _down_pointers.values()[0] != round_id:
		return
	_down_pointers[pointer_id] = round_id
	if _down_pointers.size() > 1:
		# A second finger invalidates the first too. Wait for all fingers to
		# release before accepting a new deliberate gesture.
		_capture = {}
		return
	if _board_locked or target_id.is_empty():
		return
	_capture = {"pointer_id": pointer_id, "target_id": target_id, "round_id": round_id}
	_capture.make_read_only()

func release(pointer_id: int, target_id: String, round_id: String) -> Dictionary:
	if _board_locked:
		_forget_pointer(pointer_id, round_id)
		return {"ok": false, "code": "BOARD_LOCKED"}
	if _capture.is_empty():
		_forget_pointer(pointer_id, round_id)
		return {"ok": false, "code": "NO_CAPTURE"}
	if pointer_id != _capture.pointer_id:
		return {"ok": false, "code": "POINTER_MISMATCH"}
	if round_id != _capture.round_id:
		return {"ok": false, "code": "ROUND_MISMATCH"}
	var captured := _capture
	_capture = {}
	_forget_pointer(pointer_id, round_id)
	if target_id != captured.target_id:
		return {"ok": false, "code": "TARGET_MISMATCH"}
	return {"ok": true, "code": "OK", "target_id": captured.target_id, "round_id": captured.round_id}

func cancel_all(_reason: String) -> void:
	_capture = {}
	_down_pointers.clear()

func set_board_locked(value: bool) -> void:
	_board_locked = value
	if value:
		_capture = {}

func _forget_pointer(pointer_id: int, round_id: String) -> void:
	if _down_pointers.get(pointer_id) == round_id:
		_down_pointers.erase(pointer_id)
