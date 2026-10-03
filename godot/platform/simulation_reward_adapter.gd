extends "res://platform/reward_adapter.gd"

# Explicit local simulation only. No timer, real platform call, or verified-send
# claim; the player chooses the simulated observation through named actions.
var _active: Dictionary = {}
var _hidden := false

func launch(request: Dictionary) -> void:
	if not valid_request(request) or not _active.is_empty():
		_emit_result(request, "failed")
		return
	_active = request.duplicate(true)
	_hidden = false

func complete_video() -> void:
	if _channel("video"):
		_finish("ad_close", {"isEnded": true})

func close_video_early() -> void:
	if _channel("video"):
		_finish("ad_close", {"isEnded": false})

func close_video_unverified() -> void:
	if _channel("video"):
		_finish("ad_close")

func share_hide() -> void:
	if _channel("share") and not _hidden:
		_hidden = true
		_emit_result(_active, "share_hide")

func share_return() -> void:
	if _channel("share") and _hidden:
		_finish("share_return")

func cancel() -> void:
	if not _active.is_empty():
		_finish("cancelled")

func fail_request() -> void:
	if not _active.is_empty():
		_finish("failed")

func _channel(channel: String) -> bool:
	return not _active.is_empty() and _active.channel == channel

func _finish(kind: String, extra: Dictionary = {}) -> void:
	var request := _active
	# Clear before emission so synchronous consumers may launch a new request.
	_active = {}
	_hidden = false
	_emit_result(request, kind, extra)
