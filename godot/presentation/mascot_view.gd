extends Control
## Read-only character rig. No sessions, reducers, clocks or reward calls.
## Original reference pixels are retained; body/crown use runtime shader masks.

const SOURCE := preload("res://assets/character/reference-cutout-v1.png")
const LAYER_SHADER := preload("res://presentation/shaders/mascot_layer.gdshader")
const DURATIONS := {"tap": .52, "clear": .78, "assist": .6, "revive": .88, "win": 1.7, "fail": .7}
const PRIORITIES := {"idle": 0, "tap": 1, "clear": 2, "assist": 3, "revive": 4, "win": 5, "fail": 5}

var texture: Texture2D = SOURCE
var skin := "plain"
var role := "home"
var cue := "idle"
var reduced_motion := false
var body: TextureRect
var leaf_crown: TextureRect
var _body_material: ShaderMaterial
var _leaf_material: ShaderMaterial
var _clock := 0.0
var _cue_elapsed := 0.0
var _rest_expression := "idle"
var _seen: Dictionary = {}
var _sprite_rect := Rect2()
var _current_pose: Dictionary = {}

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	leaf_crown = _layer("LeafCrown", true)
	_leaf_material = leaf_crown.material
	body = _layer("Body", false)
	_body_material = body.material
	resized.connect(_update_pose)
	_update_pose()

func _layer(layer_name: String, leaves: bool) -> TextureRect:
	var result := TextureRect.new()
	result.name = layer_name
	result.show_behind_parent = true
	result.texture = texture
	result.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	result.stretch_mode = TextureRect.STRETCH_SCALE
	result.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := ShaderMaterial.new()
	shader.shader = LAYER_SHADER
	shader.set_shader_parameter("leaves", leaves)
	result.material = shader
	add_child(result)
	return result

func set_appearance(next_skin: String, next_role := "home") -> void:
	skin = next_skin if next_skin in ["plain", "cap", "scarf"] else "plain"
	role = next_role
	_update_pose()

func set_reduced_motion(value: bool) -> void:
	if reduced_motion == value:
		return
	reduced_motion = value
	if value:
		_cue_elapsed = DURATIONS.get(cue, 0.0)
	_update_pose()

func play(next_cue: String) -> void:
	if not DURATIONS.has(next_cue):
		return
	var active: bool = _cue_elapsed < DURATIONS.get(cue, 0.0)
	if active and PRIORITIES[next_cue] < PRIORITIES.get(cue, 0):
		return
	cue = next_cue
	_cue_elapsed = 0.0
	_rest_expression = "fail" if cue == "fail" else ("win" if cue == "win" else "idle")
	if reduced_motion:
		_cue_elapsed = DURATIONS[cue]
	_update_pose()

func consume_committed(state: Dictionary, events: Array) -> void:
	var id := str(state.get("roundId", ""))
	var revision := int(state.get("revision", -1))
	if id.is_empty() or revision < 0 or revision <= int(_seen.get(id, -1)):
		return
	_seen[id] = revision
	# Bounded metadata only; scene changes and snap never replay business events.
	if _seen.size() > 8:
		_seen.erase(_seen.keys()[0])
	var chosen := "idle"
	for event in events:
		var next: String = {"TAKE": "tap", "CLEAR": "clear", "WON": "win", "LOST": "fail", "MOVE_TO_BUFFER": "assist", "UNDO": "assist", "SHUFFLED": "assist", "REVIVE_CANDIDATE_APPLIED": "revive"}.get(str(event.get("type", "")), "idle")
		if PRIORITIES[next] > PRIORITIES[chosen]:
			chosen = next
	if chosen != "idle":
		# A genuine revive must replace a prior terminal performance.
		if chosen == "revive":
			cancel_and_snap("idle")
		play(chosen)

func cancel_and_snap(expression := "idle") -> void:
	cue = "idle"
	_cue_elapsed = 0.0
	_clock = 0.0
	_rest_expression = expression if expression in ["fail", "win"] else "idle"
	_update_pose()

func _process(delta: float) -> void:
	if is_visible_in_tree():
		advance(delta)

func advance(delta: float) -> void:
	if reduced_motion or not is_finite(delta) or delta < 0.0:
		return
	_clock += delta
	_cue_elapsed += delta
	_update_pose()

func pose() -> Dictionary:
	return _current_pose.duplicate(true)

func _update_pose() -> void:
	var p := {"body_scale": Vector2.ONE, "offset": Vector2.ZERO, "rotation": 0.0, "leaf_rotation": 0.0, "blink": 0.0, "particles": 0.0, "expression": _rest_expression}
	if not reduced_motion:
		var breath := sin(_clock * TAU / 3.6)
		p.body_scale = Vector2(1.0 - breath * .008, 1.0 + breath * .012)
		p.leaf_rotation = sin(_clock * TAU / 2.8) * .025
		var blink_time := fmod(_clock, 4.9)
		if blink_time >= 3.0 and blink_time < 3.22:
			p.blink = sin((blink_time - 3.0) / .22 * PI)
		var duration: float = DURATIONS.get(cue, 0.0)
		if duration > 0 and _cue_elapsed < duration:
			var t := _cue_elapsed / duration
			match cue:
				"tap", "assist":
					var squash := sin(minf(t / .28, 1.0) * PI) * .11 if t < .28 else 0.0
					p.body_scale = Vector2(1.0 + squash, 1.0 - squash)
					p.offset.y = -sin(clampf((t - .18) / .82, 0, 1) * PI) * .028
				"clear", "revive", "win":
					p.offset.y = -absf(sin(t * PI * (2.0 if cue == "win" else 1.0))) * (.075 if cue == "revive" else .045) * (1.0 - t * .35)
					p.rotation = sin(t * TAU * 2) * .035 * (1.0 - t)
					p.body_scale = Vector2(1.0 + sin(t * TAU) * .035, 1.0 - sin(t * TAU) * .035)
					p.leaf_rotation += sin(t * TAU * 2) * .05 * (1.0 - t)
					p.particles = sin(t * PI)
				"fail":
					p.rotation = sin(t * PI) * -.065
					p.body_scale = Vector2(1.0 + sin(t * PI) * .045, 1.0 - sin(t * PI) * .06)
					p.leaf_rotation -= sin(t * PI) * .08
	_current_pose = p
	var dimensions := texture.get_size()
	var factor := minf(size.x / dimensions.x, size.y / dimensions.y)
	var drawn := dimensions * factor
	_sprite_rect = Rect2((size - drawn) / 2.0, drawn)
	if body != null:
		for part in [body, leaf_crown]:
			part.position = _sprite_rect.position + Vector2(0, p.offset.y * size.y)
			part.size = drawn
			part.pivot_offset = drawn * Vector2(.5, .96)
			part.scale = p.body_scale
			part.rotation = p.rotation
		leaf_crown.pivot_offset = drawn * Vector2(.5, .415)
		# Share the body transform at the stem, then rotate only the crown.
		var joint: Vector2 = leaf_crown.pivot_offset
		leaf_crown.position = body.position + body.pivot_offset + ((joint - body.pivot_offset) * body.scale).rotated(body.rotation) - joint
		leaf_crown.rotation += p.leaf_rotation
		_body_material.set_shader_parameter("blink", p.blink)
		_body_material.set_shader_parameter("sad", 1.0 if p.expression == "fail" else 0.0)
	queue_redraw()

func _draw() -> void:
	if _sprite_rect.size == Vector2.ZERO:
		return
	var p: Dictionary = _current_pose
	var center := _sprite_rect.position + _sprite_rect.size * Vector2(.5, .975)
	# A restrained contact shadow grounds the bounce. Root hit geometry is fixed.
	draw_set_transform(center, 0.0, Vector2(1.0, .16))
	draw_circle(Vector2.ZERO, _sprite_rect.size.x * .22, Color(.20, .32, .18, .12))
	draw_set_transform(Vector2.ZERO)
	if p.particles > 0.0 and role not in ["first", "king", "fast"]:
		for i in range(6):
			var angle := TAU * i / 6.0 - PI / 2.0
			var at: Vector2 = _sprite_rect.get_center() + Vector2(cos(angle), sin(angle)) * _sprite_rect.size.x * (.32 + .08 * p.particles)
			_star(at, maxf(1.2, size.x * .018) * p.particles, Color("f6c95e"))
	# Small vector accessories inherit the same body pivot and displacement.
	var pivot := _sprite_rect.position + _sprite_rect.size * Vector2(.5, .96)
	draw_set_transform(pivot + Vector2(0, p.offset.y * size.y), p.rotation, p.body_scale)
	var d := _sprite_rect.size
	if skin == "cap":
		var at := d * Vector2(0, -.47)
		var cap := PackedVector2Array()
		for i in range(25):
			var angle := PI + PI * i / 24.0
			cap.append(at + Vector2(cos(angle) * d.x * .18, sin(angle) * d.y * .09))
		draw_colored_polygon(cap, Color("e8b448"))
		draw_polyline(cap, Color("b78c43"), maxf(1, d.x * .007), true)
		draw_line(at + d * Vector2(-.16, -.008), at + d * Vector2(.16, -.008), Color("577457"), maxf(2, d.x * .026), true)
		var brim := PackedVector2Array()
		for i in range(33):
			var angle := TAU * i / 32.0
			brim.append(at + Vector2(cos(angle) * d.x * .235, sin(angle) * d.y * .012 + d.y * .006))
		draw_colored_polygon(brim, Color("f6c95e"))
		draw_polyline(brim, Color("b78c43"), maxf(1, d.x * .005), true)
	elif skin == "scarf":
		var at := d * Vector2(0, -.022)
		var cloth := PackedVector2Array([at + d * Vector2(-.24, -.025), at + d * Vector2(-.14, .035), at + d * Vector2(.17, .035), at + d * Vector2(.24, -.025), at + d * Vector2(.17, .005), at + d * Vector2(-.15, .005)])
		draw_colored_polygon(cloth, Color("4b7760"))
		draw_colored_polygon(PackedVector2Array([at + d * Vector2(.12, 0), at + d * Vector2(.18, .01), at + d * Vector2(.22, .12), at + d * Vector2(.14, .095)]), Color("37624b"))
	if role in ["first", "king", "fast"]:
		var at := d * Vector2(.26, -.20)
		draw_circle(at, maxf(3.0, d.x * .1), Color("f6c95e"))
		if role == "first":
			_star(at, d.x * .064, Color("fffbed"))
		elif role == "king":
			draw_colored_polygon(PackedVector2Array([at + d * Vector2(-.065, .035), at + d * Vector2(-.07, -.04), at + d * Vector2(-.022, -.012), at + d * Vector2(0, -.06), at + d * Vector2(.025, -.012), at + d * Vector2(.065, -.04), at + d * Vector2(.06, .035)]), Color("577457"))
		else:
			draw_line(at + d * Vector2(.018, -.062), at + d * Vector2(-.025, .008), Color("577457"), maxf(2, d.x * .025), true)
			draw_line(at + d * Vector2(-.025, .008), at + d * Vector2(.025, .005), Color("577457"), maxf(2, d.x * .025), true)
			draw_line(at + d * Vector2(.025, .005), at + d * Vector2(-.015, .065), Color("577457"), maxf(2, d.x * .025), true)
	draw_set_transform(Vector2.ZERO)

func _star(at: Vector2, radius: float, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(8):
		points.append(at + Vector2.from_angle(i * PI / 4.0 - PI / 2) * radius * (1.0 if i % 2 == 0 else .34))
	draw_colored_polygon(points, color)
