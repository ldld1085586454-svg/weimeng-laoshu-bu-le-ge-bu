extends Node2D
## Native rig sample only. Not a gameplay or unlock-state demonstration.
const Mascot = preload("res://presentation/mascot_view.gd")
const Assets = preload("res://presentation/theme_assets.gd")
var assets := Assets.new()
var actors: Array = []
var output := "res://artifacts/character-v5/showcase"
var captions := ["原貌 · 呼吸与叶摆", "草帽 · 外观预览", "围巾 · 外观预览", "通关 · 欢呼", "失败 · 再试一次", "复活 · 轻盈回弹"]

func _ready() -> void:
	get_window().content_scale_size = Vector2i(960, 780)
	get_window().min_size = Vector2i(960, 780)
	get_window().size = Vector2i(960, 780)
	get_window().position = Vector2i(20, 30)
	DirAccess.make_dir_recursive_absolute(output.path_join("frames"))
	for i in range(6):
		var actor := Mascot.new()
		actor.position = Vector2(61 + (i % 3) * 310, 100 + (i / 3) * 318)
		actor.size = Vector2(220, 246)
		actor.set_appearance(["plain", "cap", "scarf", "plain", "plain", "plain"][i], "showcase")
		add_child(actor)
		actor.set_process(false)
		actors.append(actor)
	queue_redraw()
	await get_tree().process_frame
	for frame in range(120):
		if frame in [0, 40, 80]:
			actors[0].play("tap")
			actors[3].play("win")
			actors[4].play("fail")
			actors[5].play("revive")
		for actor in actors:
			actor.advance(1.0 / 20.0)
		await RenderingServer.frame_post_draw
		var picture := get_viewport().get_texture().get_image()
		picture.save_png(output.path_join("frames/frame-%04d.png" % frame))
		if frame == 12: picture.save_png(output.path_join("character-states-v5.png"))
		await get_tree().create_timer(1.0 / 20.0).timeout
	var report := FileAccess.open(output.path_join("report.json"), FileAccess.WRITE)
	report.store_string(JSON.stringify({"engine": Engine.get_version_info(), "frames": 120, "fps": 20, "type": "Native character rig visual sample; no game state or skin unlock injected", "size": [960, 780]}, "\t"))
	report.close()
	get_tree().quit()

func _draw() -> void:
	draw_rect(Rect2(0, 0, 960, 780), Assets.GRASS)
	_label("卜了个卜 · 萝卜角色动效", Vector2(480, 37), 30, Assets.INK)
	_label("Godot 原生角色样张 · 不代表皮肤已解锁", Vector2(480, 72), 16, Assets.GREEN)
	for i in range(6):
		var box := StyleBoxFlat.new()
		box.bg_color = Assets.CREAM
		box.border_color = Assets.BORDER
		box.set_border_width_all(1)
		box.set_corner_radius_all(20)
		draw_style_box(box, Rect2(25 + (i % 3) * 310, 96 + (i / 3) * 318, 290, 304))
		_label(captions[i], Vector2(170 + (i % 3) * 310, 374 + (i / 3) * 318), 20, Assets.INK)
	_label("原图保持 · 无手脚新增 · 减少动效开启时所有角色静止", Vector2(480, 754), 16, Assets.GREEN)

func _label(value: String, center: Vector2, font_size: int, color: Color) -> void:
	var font := assets.font()
	var extent := font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	draw_string(font, center + Vector2(-extent.x / 2, font.get_ascent(font_size) - font.get_height(font_size) / 2), value, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)
