extends Node

# Presentation consumes committed snapshots. It never dispatches commands or
# changes quotas, revisions, settlement, or the session's duration clock.
signal presentation_finished(round_id: String, revision: int)
signal board_lock_changed(locked: bool)
signal transition_started(before: Dictionary, after: Dictionary, events: Array, timeline: Dictionary)
signal transition_progress(frame: Dictionary)

var _render_callback: Callable
var _snap_callback: Callable
var _before: Dictionary = {}
var _after: Dictionary = {}
var _events: Array = []
var _timeline: Dictionary = {}
var _authoritative: Dictionary = {}
var _active := false
var _locked := false
var _elapsed_ms := 0.0
var _generation := 0
var _round_id := ""
var _seen_revision := -1
var _retired_rounds: Dictionary = {}
var _reduced_motion := false

func _init() -> void:
	set_process(false)

func configure(render_callback: Callable, snap_callback: Callable) -> void:
	_render_callback = render_callback
	_snap_callback = snap_callback

func play_transition(before: Dictionary, after: Dictionary, events: Array, reduced_motion: bool) -> void:
	var round_id: String = after.get("roundId", "")
	var revision: int = int(after.get("revision", -1))
	if round_id.is_empty() or revision < 0 or _retired_rounds.has(round_id):
		return
	if round_id == _round_id and revision <= _seen_revision:
		return
	_select_round(round_id)
	_seen_revision = revision
	_generation += 1
	var generation := _generation
	_before = before.duplicate(true)
	_after = after.duplicate(true)
	_authoritative = _after
	_events = events.duplicate(true)
	_timeline = timeline_for(_events, reduced_motion)
	_freeze(_before)
	_freeze(_after)
	_freeze(_events)
	_freeze(_timeline)
	_elapsed_ms = 0.0
	_reduced_motion = reduced_motion
	_active = true
	set_process(true)
	_set_locked(reduced_motion or _timeline.lock_ms > 0.0)
	if generation != _generation:
		return
	transition_started.emit(_before, _after, _events, _timeline)
	if generation != _generation:
		return
	if reduced_motion:
		_snap_authoritative()
		if generation != _generation:
			return
	_publish_frame(generation)
	if generation == _generation and not reduced_motion and _timeline.duration_ms == 0.0:
		_finish(generation)

# Both normal processing and deterministic callers advance this same timeline.
# A reduced-motion transition advances on its first subsequent process frame,
# even if the engine reports zero delta. No Tween or particle is created.
func _process(delta: float) -> void:
	advance(delta * 1000.0)

func advance(delta_ms: float) -> void:
	if not _active or not is_finite(delta_ms) or delta_ms < 0.0:
		return
	var generation := _generation
	if _reduced_motion:
		_finish(generation)
		return
	_elapsed_ms = minf(_elapsed_ms + delta_ms, _timeline.duration_ms)
	if _elapsed_ms >= _timeline.lock_ms:
		_set_locked(false)
	if generation != _generation:
		return
	_publish_frame(generation)
	if generation == _generation and _elapsed_ms >= _timeline.duration_ms:
		_finish(generation)

func is_board_locked() -> bool:
	return _locked

# Frame snapshots are read-only to renderers. State and events are copied once
# on entry, not once per frame; this avoids copying the command log at 60fps.
func current_frame() -> Dictionary:
	if not _active:
		return {}
	var frame := {"before": _before, "after": _after, "events": _events,
		"timeline": _timeline, "elapsed_ms": _elapsed_ms, "board_locked": _locked,
		"round_id": _round_id, "revision": _seen_revision, "reduced_motion": _reduced_motion}
	for effect in ["take", "clear", "particles", "assist", "shuffle", "panel"]:
		var start: float = _timeline.get(effect + "_start_ms", 0.0)
		var end: float = _timeline.get(effect + "_end_ms", 0.0)
		var enabled: bool = _timeline.get("has_" + effect, false)
		frame[effect] = (1.0 if _reduced_motion else _progress(start, end)) if enabled else 0.0
		frame[effect + "_active"] = enabled and not _reduced_motion and _elapsed_ms >= start and _elapsed_ms < end
	frame.panel_visible = _timeline.has_panel and (_reduced_motion or _elapsed_ms >= _timeline.panel_start_ms)
	frame.make_read_only()
	return frame

static func _freeze(value: Variant) -> void:
	if value is Dictionary:
		for nested in value.values():
			_freeze(nested)
		value.make_read_only()
	elif value is Array:
		for nested in value:
			_freeze(nested)
		value.make_read_only()

func snap_to(state: Dictionary) -> void:
	cancel_and_snap(state)

func cancel_and_snap(state: Dictionary) -> void:
	_generation += 1
	var generation := _generation
	_clear_transition()
	_authoritative = state.duplicate(true)
	_select_round(str(state.get("roundId", "")))
	_seen_revision = maxi(_seen_revision, int(state.get("revision", -1)))
	_set_locked(false)
	if generation == _generation:
		_snap_authoritative()

func _exit_tree() -> void:
	# Scene destruction also invalidates any in-flight signal/callback stack.
	_generation += 1
	_clear_transition()
	_set_locked(false)

func _select_round(round_id: String) -> void:
	if round_id == _round_id:
		return
	if not _round_id.is_empty():
		_retired_rounds[_round_id] = true
	_round_id = round_id
	_seen_revision = -1

func _set_locked(value: bool) -> void:
	if value != _locked:
		_locked = value
		board_lock_changed.emit(value)

func _publish_frame(generation: int) -> void:
	var frame := current_frame()
	transition_progress.emit(frame)
	if generation == _generation and _render_callback.is_valid():
		_render_callback.call(frame)

func _finish(generation: int) -> void:
	if generation != _generation or not _active:
		return
	var round_id := _round_id
	var revision := _seen_revision
	_clear_transition()
	_set_locked(false)
	if generation != _generation:
		return
	_snap_authoritative()
	if generation == _generation:
		presentation_finished.emit(round_id, revision)

func _clear_transition() -> void:
	_active = false
	set_process(false)
	_before = {}
	_after = {}
	_events = []
	_timeline = {}
	_elapsed_ms = 0.0

func _snap_authoritative() -> void:
	if _snap_callback.is_valid():
		# Snap is the renderer's lifecycle cleanup point: clear transient nodes
		# and converge to this committed state, without replaying any events.
		_snap_callback.call(_authoritative.duplicate(true))

func _progress(start: float, end: float) -> float:
	if end <= start:
		return 1.0 if _elapsed_ms >= start else 0.0
	return clampf((_elapsed_ms - start) / (end - start), 0.0, 1.0)

static func timeline_for(events: Array, reduced_motion: bool = false) -> Dictionary:
	var kinds := {}
	for event in events:
		if event is Dictionary:
			kinds[str(event.get("type", ""))] = true
	var take := kinds.has("TAKE")
	var clear := kinds.has("CLEAR")
	var shuffle := kinds.has("SHUFFLED")
	var assist := shuffle or kinds.has("MOVE_TO_BUFFER") or kinds.has("UNDO") or kinds.has("REVIVE_CANDIDATE_APPLIED")
	var won := kinds.has("WON")
	var lost := kinds.has("LOST")
	var lock_ms := 445.0 if clear else (240.0 if assist else (185.0 if take or lost else 0.0))
	var panel_start_ms := 510.0 if won else (185.0 if lost else 0.0)
	var panel_end_ms := 670.0 if won else panel_start_ms
	var duration_ms := maxf(lock_ms, maxf(500.0 if clear else 0.0, maxf(260.0 if shuffle else 0.0, panel_end_ms)))
	return {"has_take": take, "take_start_ms": 0.0, "take_end_ms": 180.0,
		"has_clear": clear, "clear_start_ms": 180.0, "clear_end_ms": 440.0,
		"has_particles": clear and not reduced_motion, "particles_start_ms": 210.0, "particles_end_ms": 500.0,
		"has_assist": assist, "assist_start_ms": 0.0, "assist_end_ms": 230.0,
		"has_shuffle": shuffle, "shuffle_start_ms": 0.0, "shuffle_end_ms": 260.0,
		"has_panel": won or lost, "panel_start_ms": panel_start_ms, "panel_end_ms": panel_end_ms,
		"lock_ms": 0.0 if reduced_motion else lock_ms,
		"duration_ms": 0.0 if reduced_motion else duration_ms}
