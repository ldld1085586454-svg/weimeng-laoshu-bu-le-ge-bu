extends Node
var _root := ""
func _ready() -> void:
	get_window().min_size = Vector2i(430, 932)
	get_window().size = Vector2i(430, 932)
	_root = ProjectSettings.globalize_path("res://artifacts/home-fix/run-" + Time.get_datetime_string_from_system().replace(":", "-"))
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--qa-root="): _root = arg.trim_prefix("--qa-root=")
	get_tree().set_meta("native_qa_running", true)
	var view := _new_view()
	get_tree().root.add_child.call_deferred(view)
	await get_tree().process_frame
	var qa := preload("res://tools/home_feature_playthrough.gd").new()
	view.add_child(qa)
	qa.run(view, {"capture_dir": _root, "short": false, "resize": false, "view_factory": _new_view})
func _new_view() -> Node:
	var view = preload("res://scenes/main.tscn").instantiate()
	view._automation = true
	view.router = preload("res://ui/app_router.gd").new()
	view.router.configure(preload("res://storage/atomic_store.gd").new(_root.path_join("save")))
	return view
