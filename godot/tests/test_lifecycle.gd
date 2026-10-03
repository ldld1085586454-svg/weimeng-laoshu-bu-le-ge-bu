extends RefCounted

var frames: Array = []
var snaps: Array = []
var cancel_on_render := false
var director: Node
var authoritative: Dictionary

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://presentation/animation_director.gd"):
		a.truth(false, "lifecycle director implementation exists")
		return true
	var script = load("res://presentation/animation_director.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "lifecycle director loads")
		return true
	director = script.new()
	director.configure(_render, _snap)
	var finished: Array = []
	director.presentation_finished.connect(func(round_id, revision): finished.append([round_id, revision]))
	var before := _state("old", 0)
	var after := _state("old", 1)
	var events := [{"type": "TAKE", "id": "a"}, {"type": "CLEAR", "ids": ["a", "b", "c"]}]
	var original := after.duplicate(true)
	director.play_transition(before, after, events, false)
	before.board.rack.append("caller-mutation")
	events[1].ids.clear()
	a.equal(director.current_frame().before.board.rack, [], "director snapshots before rack at transition entry")
	a.equal(director.current_frame().events[1].ids, ["a", "b", "c"], "director snapshots incoming events")
	director.advance(210.0)
	director.cancel_and_snap(after)
	a.equal(snaps[-1], original, "background or resize cancellation snaps to committed state")
	a.equal(director.is_board_locked(), false, "cancellation releases animation lock")
	a.equal(director.current_frame(), {}, "cancellation clears all transient timeline references")
	var count: int = frames.size()
	director.advance(1000.0)
	a.equal(frames.size(), count, "cancelled timeline cannot render an old frame")
	a.equal(finished, [], "cancellation cannot report stale completion")
	director.play_transition(_state("old", 0), after, [{"type": "TAKE"}], false)
	a.equal(frames.size(), count, "cancelled committed revision cannot be replayed")
	a.equal(after, original, "cancellation changes no revision quota event or clock")

	var replacement := _state("new", 0)
	director.snap_to(replacement)
	director.play_transition(_state("old", 1), _state("old", 2), [{"type": "TAKE"}], false)
	a.equal(frames.size(), count, "retired round transition cannot overwrite new round")
	a.equal(snaps[-1], replacement, "new round stays authoritative")
	after = _state("new", 1)
	director.play_transition(replacement, after, [{"type": "TAKE"}], false)
	director.advance(50.0)
	var newer := _state("new", 2)
	director.play_transition(after, newer, [{"type": "UNDO"}], false)
	director.advance(185.0)
	a.equal(finished, [], "superseded flight cannot finish newer assist early")
	director.advance(55.0)
	a.equal(finished, [["new", 2]], "only current generation reports completion")

	var reduced := _state("new", 3)
	director.play_transition(newer, reduced, [{"type": "TAKE"}, {"type": "CLEAR"}, {"type": "WON"}], true)
	a.equal(snaps[-1], reduced, "reduced motion immediately displays committed state")
	a.equal(director.current_frame().particles_active, false, "reduced motion never starts particles")
	a.equal(director.current_frame().take, 1.0, "reduced motion has no flight interpolation")
	a.truth(director.is_board_locked(), "reduced motion keeps lock for current frame")
	a.equal(finished.size(), 1, "reduced motion does not finish synchronously")
	director._process(0.0)
	a.equal(director.is_board_locked(), false, "reduced motion unlocks on next process frame")
	a.equal(finished[-1], ["new", 3], "reduced motion finishes presentation on next frame")

	authoritative = _state("new", 4)
	cancel_on_render = true
	director.play_transition(reduced, authoritative, [{"type": "TAKE"}], false)
	a.equal(director.is_board_locked(), false, "render-triggered lifecycle cancellation stays unlocked")
	a.equal(director.current_frame(), {}, "reentrant cancellation invalidates in-progress callback")
	director.advance(1000.0)
	a.equal(finished.size(), 2, "callback from cancelled generation cannot complete")
	a.equal(snaps[-1], authoritative, "reentrant cancellation keeps authoritative snap")
	after = _state("new", 5)
	director.play_transition(authoritative, after, [{"type": "TAKE"}], false)
	count = frames.size()
	for invalid_delta in [-1.0, INF, NAN]:
		director.advance(invalid_delta)
	a.equal(frames.size(), count, "invalid deltas cannot corrupt or advance the timeline")
	a.equal(director.current_frame().elapsed_ms, 0.0, "invalid deltas leave elapsed time at zero")
	var cancel_at_unlock: Callable = func(locked):
		if not locked:
			director.cancel_and_snap(after)
	director.board_lock_changed.connect(cancel_at_unlock)
	director.advance(185.0)
	a.equal(director.current_frame(), {}, "unlock-triggered lifecycle cancellation clears current frame")
	a.equal(frames.size(), count, "unlock-triggered cancellation suppresses obsolete render callback")
	a.equal(finished.size(), 2, "unlock-triggered cancellation suppresses obsolete completion")
	director.board_lock_changed.disconnect(cancel_at_unlock)
	after = _state("new", 6)
	director.play_transition(_state("new", 5), after, [{"type": "TAKE"}], false)
	director._exit_tree()
	a.equal(director.is_board_locked(), false, "scene exit releases presentation lock")
	a.equal(director.current_frame(), {}, "scene exit clears transient timeline references")
	director.advance(1000.0)
	a.equal(finished.size(), 2, "scene exit invalidates pending presentation completion")
	director.free()
	return true

func _render(frame: Dictionary) -> void:
	frames.append(frame)
	if cancel_on_render:
		cancel_on_render = false
		director.cancel_and_snap(authoritative)

func _snap(state: Dictionary) -> void:
	snaps.append(state)

func _state(round_id: String, revision: int) -> Dictionary:
	return {"roundId": round_id, "revision": revision, "board": {"rack": [], "status": "PLAYING"},
		"used": {"move": 0}, "events": [], "elapsedMs": 1234}
