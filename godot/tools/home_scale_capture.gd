extends Node
## Real native-window screenshots across aspect ratios and render scale.
## These are renderer/window-size checks, not Windows OS DPI measurements.
var _failures: Array[String] = []
var _rows: Array = []
var view: Node
var _out := ""
func _ready() -> void:
	_run.call_deferred()
func _run() -> void:
	_out = ProjectSettings.globalize_path("res://artifacts/home-fix/scales")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output-dir="): _out = arg.trim_prefix("--output-dir=")
	DirAccess.make_dir_recursive_absolute(_out)
	get_tree().set_meta("native_qa_running", true)
	get_window().set_flag(Window.FLAG_BORDERLESS, true)
	view = preload("res://scenes/main.tscn").instantiate()
	view._automation = true
	view.router = preload("res://ui/app_router.gd").new()
	view.router.configure(preload("res://tests/helpers/service_memory_store.gd").new(), null, Callable(), Callable(), "scale-capture")
	get_tree().root.add_child(view)
	for dimensions in [Vector2i(430,932), Vector2i(390,720), Vector2i(540,960), Vector2i(645,1398), Vector2i(860,1864), Vector2i(932,600)]:
		get_window().min_size = dimensions
		get_window().size = dimensions
		await get_tree().create_timer(.35).timeout
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		var filename := "home-%dx%d.png" % [dimensions.x, dimensions.y]
		var row := {"requested": [dimensions.x, dimensions.y], "client": [get_window().size.x, get_window().size.y], "render": [image.get_width(),image.get_height()], "screenshot": filename, "clicks": []}
		image.save_png(_out.path_join(filename))
		if get_window().size != dimensions: _failures.append("Window size differs: " + filename)
		for id in ["menu:rank", "menu:friends", "menu:wardrobe", "menu:profile", "menu:club"]:
			var button: Button = view.buttons[id]
			_click(button.get_global_rect().position + Vector2(24,button.size.y / 2.0))
			await get_tree().process_frame
			var opened: bool = view.model.screen == "social" and view.model.page == id.trim_prefix("menu:")
			row.clicks.append({"id":id,"ok":opened})
			if not opened:
				_failures.append(filename + " icon hit did not open " + id)
				break
			_click(view.buttons["return-home"].get_global_rect().get_center())
			await get_tree().process_frame
		_rows.append(row)
	var result := {"ok":_failures.is_empty(), "failures":_failures,"scenarios":_rows,"scope":"Linux Godot real window sizes and native viewport captures; logical-coordinate mouse input; Windows OS DPI not measured"}
	FileAccess.open(_out.path_join("report.json"),FileAccess.WRITE).store_string(JSON.stringify(result,"\t"))
	print("SCALE_QA_RESULT ",JSON.stringify(result))
	view.queue_free()
	view=null
	await get_tree().process_frame
	await get_tree().process_frame
	var tree := get_tree()
	# Let the audio server retire the final click stream before process exit.
	await tree.create_timer(.6).timeout
	queue_free()
	tree.quit.call_deferred(0 if _failures.is_empty() else 1)
func _click(point: Vector2) -> void:
	var motion:=InputEventMouseMotion.new()
	motion.position=point
	get_viewport().push_input(motion,true)
	var e:=InputEventMouseButton.new()
	e.position=point
	e.button_index=MOUSE_BUTTON_LEFT
	e.pressed=true
	get_viewport().push_input(e,true)
	e=InputEventMouseButton.new()
	e.position=point
	e.button_index=MOUSE_BUTTON_LEFT
	e.pressed=false
	get_viewport().push_input(e,true)
