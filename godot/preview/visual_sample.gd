extends Node2D
## Stage-one presentation study. It does not mutate a round or simulate progress.
## The board reads the imported source deal, at its untouched initial state.

const SIZE := Vector2(430, 932)
const INK := Color("254332")
const GRASS := Color("f2f6e9")
const CREAM := Color("fffcf3")
const MUTED := Color("78836e")
const GREEN := Color("577457")
const BORDER := Color("bec9ac")
const YELLOW := Color("f6c95e")
var font: Font
var mascot: Texture2D
var background_home: Texture2D
var background_board: Texture2D
var manifest: Dictionary
var icon_paths: Dictionary
var textures: Dictionary = {}
var cells: Array = []
var mode := "home"
var capturing := false

func _ready() -> void:
	font = load("res://assets/theme/fonts/ZCOOLKuaiLe-Regular.ttf")
	mascot = load("res://assets/character/reference-cutout-v1.png")
	background_home = load("res://assets/theme/home.png")
	background_board = load("res://assets/theme/board.png")
	manifest = JSON.parse_string(FileAccess.get_file_as_string("res://assets/theme/manifest.json"))
	icon_paths = JSON.parse_string(FileAccess.get_file_as_string("res://assets/ui-icons/icon-map.json"))
	var deal: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/deals/deal-270.json"))
	cells = deal.cells
	for glyph in "卜了个萝队排行榜好友话题装扮我的俱乐部加入广东每日挑战移出撤回洗牌预留区槽位相同张消除视觉样初始":
		if not font.has_char(glyph.unicode_at(0)):
			push_error("Missing font glyph: " + glyph)
	queue_redraw()
	if "--capture-samples" in OS.get_cmdline_user_args():
		capturing = true
		capture_samples.call_deferred()

func capture_samples() -> void:
	DirAccess.make_dir_recursive_absolute("res://artifacts/visual-samples")
	for sample in ["home", "board"]:
		mode = sample
		queue_redraw()
		await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var rendered := get_viewport().get_texture().get_image()
		var destination := "res://artifacts/visual-samples/godot-%s-v1.png" % sample
		var result := rendered.save_png(destination)
		print("SAMPLE_CAPTURE ", sample, " viewport=", rendered.get_width(), "x", rendered.get_height(), " save=", result)
	get_tree().quit()

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not capturing:
		if event.keycode == KEY_SPACE:
			mode = "board" if mode == "home" else "home"
			queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, SIZE), GRASS)
	if font == null:
		return
	if mode == "home":
		draw_home()
	else:
		draw_board()

func panel(rect: Rect2, fill := CREAM, radius := 14.0, border := BORDER, width := 1.5) -> void:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(int(width))
	box.set_corner_radius_all(int(radius))
	draw_style_box(box, rect)

func shadow_panel(rect: Rect2, fill := CREAM, radius := 14.0) -> void:
	panel(Rect2(rect.position + Vector2(0, 4), rect.size), Color("b5c39f"), radius, Color("b5c39f"), 0)
	panel(rect, fill, radius)

func label(text: String, center: Vector2, size := 20, color := INK) -> void:
	var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(font, center + Vector2(-width / 2.0, font.get_ascent(size) - font.get_height(size) / 2.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func icon(name: String, rect: Rect2, color := INK) -> void:
	var path: String = icon_paths.get(name, "")
	if path.is_empty():
		push_error("Missing icon " + name)
		return
	if not textures.has(path):
		textures[path] = load(path)
	draw_texture_rect(textures[path], rect, false, color)

func contain(texture: Texture2D, rect: Rect2, tint := Color.WHITE) -> void:
	if texture == null:
		return
	var scale_factor := minf(rect.size.x / texture.get_width(), rect.size.y / texture.get_height())
	var dimensions := texture.get_size() * scale_factor
	draw_texture_rect(texture, Rect2(rect.get_center() - dimensions / 2.0, dimensions), false, tint)

func background(texture: Texture2D) -> void:
	if texture == null:
		return
	var scale_factor := maxf(SIZE.x / texture.get_width(), SIZE.y / texture.get_height())
	var dimensions := texture.get_size() * scale_factor
	draw_texture_rect(texture, Rect2((SIZE - dimensions) / 2.0, dimensions), false)

func draw_home() -> void:
	background(background_home)
	panel(Rect2(367, 24, 48, 48), CREAM, 16)
	icon("settings", Rect2(379, 36, 24, 24))
	label("卜了个卜", Vector2(215, 64), 43)
	label("每天三张，快乐一场", Vector2(215, 111), 17, GREEN)
	# Honor positions use the new mascot identity, with clear text instead of sheep.
	var honors := ["首通萝卜", "萝卜王", "手速达人"]
	for n in range(3):
		var x := 28.0 + n * 132.0
		panel(Rect2(x, 149, 110, 92), Color("fffcf3d9"), 14)
		contain(mascot, Rect2(x + 35, 157, 40, 43))
		label(honors[n], Vector2(x + 55, 219), 17)
	contain(mascot, Rect2(92, 260, 246, 307))
	panel(Rect2(87, 575, 256, 42), Color("fffcf3ed"), 18)
	icon("locate", Rect2(109, 584, 24, 24), GREEN)
	label("广东萝卜队", Vector2(229, 596), 22)
	shadow_panel(Rect2(51, 637, 328, 66), YELLOW, 20)
	label("加入萝卜队", Vector2(215, 670), 28)
	label("本地队伍贡献  0", Vector2(215, 724), 16, GREEN)
	panel(Rect2(29, 753, 372, 134), Color("fffcf3eb"), 20)
	var names := ["排行榜", "好友", "话题", "装扮", "我的", "俱乐部"]
	var symbols := ["rank", "friends", "topic", "wardrobe", "profile", "club"]
	for n in range(6):
		var center := Vector2(91 + (n % 3) * 124, 782 + (n / 3) * 62)
		icon(symbols[n], Rect2(center - Vector2(13, 13), Vector2(26, 26)), GREEN)
		label(names[n], center + Vector2(0, 25), 16)
	label("Godot 视觉样张 V1", Vector2(215, 909), 13, MUTED)

func draw_board() -> void:
	background(background_board)
	panel(Rect2(16, 23, 48, 48), CREAM, 16)
	icon("back", Rect2(28, 35, 24, 24))
	panel(Rect2(366, 23, 48, 48), CREAM, 16)
	icon("settings", Rect2(378, 35, 24, 24))
	label("每日挑战", Vector2(215, 44), 27)
	label("广东萝卜队 · 初始棋盘", Vector2(215, 81), 15, GREEN)
	contain(mascot, Rect2(29, 92, 36, 43))
	panel(Rect2(79, 108, 319, 12), Color("d5dfc4"), 6, Color("d5dfc4"), 0)
	label("0 / 270", Vector2(215, 142), 15, GREEN)
	draw_initial_deal()
	label("预留区", Vector2(78, 622), 16, GREEN)
	for n in range(3):
		panel(Rect2(142 + n * 49, 603, 43, 40), Color("e1e8d4"), 8)
	panel(Rect2(17, 662, 396, 88), CREAM, 15)
	for n in range(7):
		panel(Rect2(26 + n * 55, 674, 48, 57), Color("e1e8d4"), 8)
	label("相同三张即可消除", Vector2(215, 772), 17, GREEN)
	var names := ["移出", "撤回", "洗牌"]
	var symbols := ["move", "undo", "shuffle"]
	for n in range(3):
		var x := 39.0 + n * 125.0
		shadow_panel(Rect2(x, 805, 102, 74), CREAM, 16)
		icon(symbols[n], Rect2(x + 17, 817, 27, 27), GREEN)
		label(names[n], Vector2(x + 64, 832), 20)
		label("剩余 1 次", Vector2(x + 51, 859), 13, MUTED)
	label("Godot 视觉样张 V1 · 未产生玩家进度", Vector2(215, 908), 12, MUTED)

func source_overlap(a: Dictionary, b: Dictionary) -> bool:
	return a.x < b.x + b.w and b.x < a.x + a.w and a.y < b.y + b.h and b.y < a.y + a.h

func initial_blocked(cell: Dictionary) -> bool:
	if cell.zone == "board":
		for other in cells:
			if other.zone == "board" and other.z > cell.z and source_overlap(cell.rect, other.rect):
				return true
	elif cell.zone == "side":
		return cell.get("position", 0) > 0
	return false

func draw_initial_deal() -> void:
	var board: Array = cells.filter(func(cell): return cell.zone == "board")
	var min_x := INF
	var min_y := INF
	var max_x := -INF
	var max_y := -INF
	for cell in board:
		min_x = minf(min_x, cell.rect.x - 1.5)
		min_y = minf(min_y, cell.rect.y - 1.5)
		max_x = maxf(max_x, cell.rect.x + cell.rect.w + 1.5)
		max_y = maxf(max_y, cell.rect.y + cell.rect.h + 1.5)
	var sx := minf(390.0 / (max_x - min_x), 368.0 / ((max_y - min_y) * 1.25))
	var sy := sx * 1.25
	var offset := Vector2((430 - (max_x - min_x) * sx) / 2.0 - min_x * sx, 173 - min_y * sy)
	board.sort_custom(func(a, b): return a.z < b.z if a.z != b.z else a.id < b.id)
	for cell in board:
		var r: Dictionary = cell.rect
		var rect := Rect2(offset + Vector2((r.x - 1.5) * sx, (r.y - 1.5) * sy), Vector2((r.w + 3) * sx, (r.h + 3) * sy))
		draw_card(cell.type, rect, initial_blocked(cell))
	var sides: Array = cells.filter(func(cell): return cell.zone == "side")
	var stacks: Dictionary = {}
	for cell in sides:
		if not stacks.has(cell.stackId):
			stacks[cell.stackId] = []
		stacks[cell.stackId].append(cell)
	var stack_names := stacks.keys()
	stack_names.sort()
	for index in range(stack_names.size()):
		var stack: Array = stacks[stack_names[index]]
		stack.sort_custom(func(a, b): return a.position > b.position)
		var x := 26.0 if index == 0 else 349.0
		for cell in stack:
			var depth := minf(cell.position, 6)
			draw_card(cell.type, Rect2(x - (depth * 1.4 if index == 0 else -depth * 1.4), 549 + depth * 1.3, 55, 51), cell.position > 0)
		label(str(stack.size()) + " 张", Vector2(x + 27, 538), 11, GREEN)

func draw_card(type: String, rect: Rect2, blocked: bool) -> void:
	var tint := Color("a6b594") if blocked else Color.WHITE
	panel(Rect2(rect.position + Vector2(0, 3), rect.size), Color("9daf83"), 5, Color("9daf83"), 0)
	panel(rect, Color("d4dec5") if blocked else CREAM, 5, Color("94a47c"), 1)
	var asset: Dictionary = manifest.assets["tile." + type]
	if not textures.has(asset.src):
		textures[asset.src] = load("res://" + asset.src)
	var region: Dictionary = asset.rect
	var source := Rect2(region.x, region.y, region.w, region.h)
	var scale_factor := minf((rect.size.x * .68) / source.size.x, (rect.size.y * .70) / source.size.y)
	var dimensions := source.size * scale_factor
	draw_texture_rect_region(textures[asset.src], Rect2(rect.get_center() - dimensions / 2.0, dimensions), source, tint)
