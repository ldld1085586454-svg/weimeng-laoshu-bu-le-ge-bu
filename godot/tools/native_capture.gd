extends Node
## Optional editor-friendly entry point for genuine native mouse-only QA.
## Uses a fresh isolated disk namespace; never opens the normal player save.

var _root := ""

func _ready() -> void:
	get_window().min_size = Vector2i(430, 932)
	get_window().size = Vector2i(430, 932)
	_root = "res://artifacts/character-v5/run-%s" % Time.get_datetime_string_from_system().replace(":", "-")
	get_tree().set_meta("native_qa_running", true)
	var view := _new_view()
	get_tree().root.add_child.call_deferred(view)
	await get_tree().process_frame
	var qa := preload("res://tools/native_playthrough.gd").new()
	view.add_child(qa)
	qa.run(view, {"capture_dir": ProjectSettings.globalize_path(_root), "short": true, "resize": false, "view_factory": _new_view})

func _new_view() -> Node:
	var view = preload("res://scenes/main.tscn").instantiate()
	view._automation = true
	view.router = preload("res://ui/app_router.gd").new()
	view.router.configure(preload("res://storage/atomic_store.gd").new(_root.path_join("save")))
	return view
