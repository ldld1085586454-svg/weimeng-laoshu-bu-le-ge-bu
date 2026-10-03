extends Node

func _ready() -> void:
	get_window().size = Vector2i(430, 932)
	var view = preload("res://scenes/main.tscn").instantiate()
	view._automation = true
	get_tree().set_meta("native_qa_running", true)
	view.router = preload("res://ui/app_router.gd").new()
	view.router.configure(preload("res://tests/helpers/service_memory_store.gd").new(), null, Callable(), Callable(), "layout-capture")
	get_tree().root.add_child.call_deferred(view)
	await get_tree().process_frame
	await get_tree().create_timer(.4).timeout
	await RenderingServer.frame_post_draw
	var output := ProjectSettings.globalize_path("res://artifacts/home-fix/home.png")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
	DirAccess.make_dir_recursive_absolute(output.get_base_dir())
	get_viewport().get_texture().get_image().save_png(output)
	print("CAPTURE ", output)
	view.queue_free()
	await get_tree().process_frame
	var tree := get_tree()
	view = null
	await tree.process_frame
	queue_free()
	tree.quit.call_deferred()
