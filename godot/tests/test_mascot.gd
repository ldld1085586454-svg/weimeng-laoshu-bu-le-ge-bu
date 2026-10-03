extends RefCounted

func run(a: RefCounted) -> bool:
	var path := "res://presentation/mascot_view.gd"
	if not FileAccess.file_exists(path):
		a.truth(false, "layered radish presentation exists")
		return true
	var script = load(path)
	if script == null or not script.can_instantiate():
		a.truth(false, "layered radish compiles")
		return true
	var tree: SceneTree = Engine.get_main_loop()
	var mascot = script.new()
	mascot.size = Vector2(246, 307)
	tree.root.add_child(mascot)
	mascot.set_process(false)
	a.equal(mascot.texture.resource_path, "res://assets/character/reference-cutout-v1.png", "rig preserves exact reference texture identity")
	a.equal(mascot.mouse_filter, Control.MOUSE_FILTER_IGNORE, "mascot never intercepts board input")
	a.truth(mascot.has_node("Body") and mascot.has_node("LeafCrown"), "body and crown are independently animated layers")
	var rest: Dictionary = mascot.pose()
	mascot.advance(.75)
	a.truth(mascot.pose().body_scale != rest.body_scale, "idle breathing changes body pose")
	a.truth(mascot.pose().leaf_rotation != rest.leaf_rotation, "leaf crown sways independently")
	mascot.advance(2.33)
	a.truth(mascot.pose().blink > 0.0, "deterministic idle includes a visible blink")
	mascot.play("tap")
	mascot.advance(.08)
	a.truth(mascot.pose().body_scale.x > 1.0 and mascot.pose().body_scale.y < 1.0, "tap begins with a soft squash")
	var joint: Vector2 = mascot.leaf_crown.pivot_offset
	var body_joint: Vector2 = mascot.body.get_transform() * joint
	var leaf_joint: Vector2 = mascot.leaf_crown.get_transform() * joint
	a.truth(body_joint.distance_to(leaf_joint) < .01, "body squash preserves leaf stem attachment")
	mascot.cancel_and_snap()
	mascot.consume_committed({"roundId": "shuffle-test", "revision": 1}, [{"type": "SHUFFLED"}])
	a.equal(mascot.cue, "assist", "actual SHUFFLED event animates the character")
	mascot.cancel_and_snap()
	var state := {"roundId": "mascot-a", "revision": 3, "board": {"status": "PLAYING"}}
	var events := [{"type": "CLEAR"}]
	var original := state.duplicate(true)
	mascot.consume_committed(state, events)
	a.equal(mascot.cue, "clear", "committed triple plays cheer")
	mascot.advance(.1)
	var first_pose: Dictionary = mascot.pose()
	mascot.consume_committed(state, events)
	a.equal(mascot.pose(), first_pose, "duplicate committed revision does not restart cue")
	a.equal(state, original, "character never mutates authoritative state")
	state.revision = 4
	state.board.status = "WON"
	mascot.consume_committed(state, [{"type": "CLEAR"}, {"type": "WON"}])
	a.equal(mascot.cue, "win", "terminal cue wins over triple feedback")
	mascot.play("tap")
	a.equal(mascot.cue, "win", "tap cannot interrupt terminal celebration")
	mascot.cancel_and_snap("fail")
	a.equal(mascot.pose().expression, "fail", "cancel leaves final terminal expression")
	mascot.play("revive")
	mascot.advance(.24)
	a.equal(mascot.cue, "revive", "revive replaces failed pose")
	a.truth(mascot.pose().offset.y < 0, "revive rebounds upward")
	for skin in ["plain", "cap", "scarf"]:
		mascot.set_appearance(skin, "home")
		a.equal(mascot.skin, skin, skin + " cosmetic is represented")
	mascot.set_appearance("unknown", "home")
	a.equal(mascot.skin, "plain", "unknown skin safely uses plain")
	mascot.set_reduced_motion(true)
	mascot.play("win")
	var still: Dictionary = mascot.pose()
	mascot.advance(20)
	a.equal(mascot.pose(), still, "reduced motion freezes all character motion")
	a.equal(still.blink, 0.0, "reduced motion disables blinking")
	a.equal(still.particles, 0.0, "reduced motion disables celebration particles")
	a.equal(still.body_scale, Vector2.ONE, "reduced motion has no squash or breathing")
	mascot.set_reduced_motion(false)
	mascot.cancel_and_snap("idle")
	a.equal(mascot.cue, "idle", "resize or new scene cancels transient character performance")
	mascot.free()
	return true
