extends RefCounted

var frames: Array = []
var snaps: Array = []

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://presentation/animation_director.gd"):
		a.truth(false, "animation director implementation exists")
		return true
	var script = load("res://presentation/animation_director.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "animation director loads")
		return true
	var director = script.new()
	director.configure(_render, _snap)
	var finished: Array = []
	var locks: Array = []
	director.presentation_finished.connect(func(round_id, revision): finished.append([round_id, revision]))
	director.board_lock_changed.connect(func(locked): locks.append(locked))
	var before := _state("round-a", 0, ["a", "b"])
	var after := _state("round-a", 1, ["a", "b", "c"])
	var original_before := before.duplicate(true)
	var original_after := after.duplicate(true)
	var events := [{"type": "TAKE", "id": "c"}]
	director.play_transition(before, after, events, false)
	var published: Dictionary = director.current_frame()
	for field in ["before", "after", "events", "timeline"]:
		a.truth(published[field].is_read_only(), "published " + field + " is read only")
	a.truth(published.is_read_only(), "published frame is read only")
	a.truth(published.after.board.is_read_only(), "nested board is read only")
	a.truth(published.after.board.rack.is_read_only(), "nested rack is read only")
	a.truth(published.events[0].is_read_only(), "nested event is read only")
	a.truth(director is Node, "director is a presentation node")
	a.equal(locks, [true], "take immediately locks the board")
	a.equal(frames[-1].before.board.rack, ["a", "b"], "before rack remains available during flight")
	var frame_count: int = frames.size()
	director.play_transition(before, after, events, false)
	a.equal(frames.size(), frame_count, "duplicate committed revision does not replay")
	director.advance(90.0)
	a.equal(frames[-1].take, 0.5, "flight halfway at 90ms")
	director.advance(90.0)
	a.equal(frames[-1].take, 1.0, "flight completes at 180ms")
	a.equal(locks, [true], "take remains locked until 185ms")
	director.advance(5.0)
	a.equal(locks, [true, false], "take unlocks at 185ms")
	a.equal(finished, [["round-a", 1]], "finished reports presentation identity once")
	a.equal(snaps[-1], after, "take ends at authoritative committed state")
	director.advance(1000.0)
	director.play_transition(before, after, events, false)
	a.equal(finished.size(), 1, "finished and replay remain idempotent")
	a.equal(before, original_before, "presentation never changes before state")
	a.equal(after, original_after, "presentation never changes revision quota events or elapsed time")

	before = after
	after = _state("round-a", 2, [])
	events = [{"type": "TAKE", "id": "d"}, {"type": "CLEAR", "ids": ["a", "b", "d"]}]
	director.play_transition(before, after, events, false)
	a.equal(frames[-1].before.board.rack, ["a", "b", "c"], "clear retains precommit rack for transient rendering")
	director.advance(180.0)
	a.equal(frames[-1].clear, 0.0, "clear starts after 180ms flight")
	a.truth(frames[-1].clear_active, "clear is active at 180ms")
	a.equal(frames[-1].particles_active, false, "particles wait until 210ms")
	director.advance(30.0)
	a.truth(frames[-1].particles_active, "particles begin at 210ms")
	director.advance(230.0)
	a.equal(frames[-1].clear, 1.0, "clear reaches endpoint at 440ms")
	a.truth(director.is_board_locked(), "clear lock persists through 440ms")
	director.advance(5.0)
	a.equal(director.is_board_locked(), false, "clear unlocks at 445ms while particles continue")
	a.truth(frames[-1].particles_active, "particles do not lengthen board lock")
	a.equal(finished.size(), 1, "presentation waits for particles separately from board lock")
	director.advance(55.0)
	a.equal(finished[-1], ["round-a", 2], "clear presentation ends at 500ms")

	var revision := 3
	for event_type in ["MOVE_TO_BUFFER", "UNDO", "REVIVE_CANDIDATE_APPLIED", "SHUFFLED"]:
		before = after
		after = _state("round-a", revision, [])
		director.play_transition(before, after, [{"type": event_type}], false)
		director.advance(230.0)
		a.equal(frames[-1].assist, 1.0, event_type + " assist movement completes at 230ms")
		a.truth(director.is_board_locked(), event_type + " remains locked through 230ms")
		director.advance(10.0)
		a.equal(director.is_board_locked(), false, event_type + " unlocks at 240ms")
		if event_type == "SHUFFLED":
			a.truth(frames[-1].shuffle_active, "shuffle pulse continues after unlocking")
			director.advance(20.0)
			a.equal(snaps[-1], after, "shuffle ends at committed permutation at 260ms")
		revision += 1

	before = after
	after = _state("round-a", revision, [], "LOST")
	director.play_transition(before, after, [{"type": "TAKE", "id": "seventh"}, {"type": "LOST"}], false)
	a.equal(frames[-1].after.board.status, "LOST", "lost state is committed before flight finishes")
	a.equal(frames[-1].panel_visible, false, "lost panel does not obscure flight")
	director.advance(184.0)
	a.equal(frames[-1].panel_visible, false, "lost panel remains hidden before 185ms")
	director.advance(1.0)
	a.truth(frames[-1].panel_visible, "lost panel appears at 185ms")
	a.equal(director.is_board_locked(), false, "lost animation does not retain a business lock")

	before = after
	after = _state("round-a", revision + 1, [], "WON")
	director.play_transition(before, after, [{"type": "TAKE", "id": "last"}, {"type": "CLEAR", "ids": ["a", "b", "last"]}, {"type": "WON"}], false)
	a.equal(frames[-1].after.board.status, "WON", "won business state is immediate")
	director.advance(509.0)
	a.equal(frames[-1].panel_visible, false, "won panel waits at least 510ms")
	a.equal(director.is_board_locked(), false, "won panel does not extend 445ms clear lock")
	director.advance(1.0)
	a.truth(frames[-1].panel_visible, "won panel begins at 510ms")
	a.equal(frames[-1].panel, 0.0, "won panel starts transparent")
	director.advance(80.0)
	a.equal(frames[-1].panel, 0.5, "won panel fades over 160ms")
	director.advance(80.0)
	a.equal(finished[-1], ["round-a", revision + 1], "won presentation completes at 670ms")
	before = after
	after = _state("round-a", revision + 2, [])
	var lock_count: int = locks.size()
	director.play_transition(before, after, [{"type": "REWARD_OFFERED"}], false)
	a.equal(locks.size(), lock_count, "reward transactions do not create an animation board lock")
	a.equal(snaps[-1], after, "nonvisual committed event snaps immediately")
	a.equal(finished[-1], ["round-a", revision + 2], "nonvisual commit reports presentation completion")
	frame_count = frames.size()
	director.play_transition(_state("round-a", 0, []), _state("round-a", 1, []), events, false)
	a.equal(frames.size(), frame_count, "older committed revision cannot replay after newer completion")
	director.free()
	return true

func _render(frame: Dictionary) -> void:
	frames.append(frame)

func _snap(state: Dictionary) -> void:
	snaps.append(state)

func _state(round_id: String, revision: int, rack: Array, status: String = "PLAYING") -> Dictionary:
	return {"roundId": round_id, "revision": revision, "board": {"rack": rack, "status": status},
		"used": {"move": 0, "undo": 0, "shuffle": 0, "revive": 0}, "events": [], "elapsedMs": 1234}
