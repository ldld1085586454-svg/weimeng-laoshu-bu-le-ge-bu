extends RefCounted
func run(a: RefCounted) -> bool:
	var view = preload("res://scenes/main.tscn").instantiate()
	view.router = preload("res://ui/app_router.gd").new()
	view.router.configure(preload("res://tests/helpers/service_memory_store.gd").new(), null, Callable(), Callable(), "bullet-layout")
	var tree := Engine.get_main_loop() as SceneTree
	tree.root.add_child(view)
	await tree.process_frame
	a.truth(view.has_method("_bullet_rect"), "banner layout is screen-aware rather than sharing the overlapping fixed y=124 region")
	if not view.has_method("_bullet_rect"):
		view.free()
		return true
	view.model = {"screen":"home", "notice":""}
	a.equal(view._bullet_rect(), Rect2(38,124,354,24), "home banner keeps approved gap above honor cards")
	view.model.screen = "social"
	var rect: Rect2 = view._bullet_rect()
	a.truth(not rect.intersects(Rect2(0,136,430,17)), "social banner never covers subtitle")
	a.truth(not rect.intersects(Rect2(28,179,374,67)), "social banner never covers first content card")
	view.model.screen = "play"
	rect = view._bullet_rect()
	a.truth(not rect.intersects(Rect2(44,138,342,12)), "play banner never covers actual game progress bar")
	a.truth(not rect.intersects(Rect2(28,805,374,75)), "play banner never covers assist actions")
	a.truth(not rect.intersects(Rect2(0,903,430,16)), "play banner never covers footer")
	view.model.notice = "GRANT_FAILED"
	a.equal(view._bullet_rect().size, Vector2.ZERO, "important current play notice has priority over decorative local banner")
	view.free()
	return true
