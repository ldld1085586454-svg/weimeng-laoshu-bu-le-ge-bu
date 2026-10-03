extends RefCounted

func run(a: RefCounted) -> bool:
	var view = preload("res://scenes/main.tscn").instantiate()
	view.router = preload("res://ui/app_router.gd").new()
	view.router.configure(preload("res://tests/helpers/service_memory_store.gd").new(), null, Callable(), Callable(), "button-layout")
	var tree := Engine.get_main_loop() as SceneTree
	tree.root.add_child(view)
	await tree.process_frame
	for id in ["menu:rank", "menu:friends", "menu:topic", "menu:wardrobe", "menu:profile", "menu:club", "menu:bullet", "menu:about"]:
		var button: Button = view.buttons[id]
		a.truth(button.icon != null, id + " retains its actual icon")
		for state in ["normal", "hover", "pressed", "disabled"]:
			var box := button.get_theme_stylebox(state)
			a.truth(box.get_margin(SIDE_LEFT) >= 10.0 and box.get_margin(SIDE_RIGHT) >= 10.0, id + " " + state + " keeps the native icon/text drawing region safely inside rounded button")
		a.truth(button.get_rect().size.x <= 125, id + " icon padding does not expand its hit target into neighbor")
	var settings: Button = view.buttons.settings
	a.equal(settings.icon_alignment, HORIZONTAL_ALIGNMENT_CENTER, "icon-only settings glyph is centered in its 48px hit target")
	a.equal(settings.size, Vector2(48, 48), "settings target is unchanged")
	view.queue_free()
	await tree.process_frame
	return true
