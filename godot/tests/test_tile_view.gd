extends RefCounted

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://presentation/theme_assets.gd") or not FileAccess.file_exists("res://presentation/tile_view.gd"):
		a.truth(false, "native theme and tile primitives exist")
		return true
	var assets_script = load("res://presentation/theme_assets.gd")
	var tile_script = load("res://presentation/tile_view.gd")
	if assets_script == null or tile_script == null or not assets_script.can_instantiate() or not tile_script.can_instantiate():
		a.truth(false, "native theme and tile primitives load")
		return true
	var assets = assets_script.new()
	var index: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/theme/user-cards-index.json"))
	var original := Image.new()
	original.load_png_from_buffer(FileAccess.get_file_as_bytes("res://assets/theme/user-cards.png"))
	# Mirror the existing source sheet's process/fix_alpha_border import setting.
	original.fix_alpha_edges()
	for sprite in index.sprites:
		if sprite.type == null:
			continue
		var key: String = "tile." + sprite.type
		var texture: Texture2D = assets.texture(key)
		a.truth(texture is AtlasTexture, key + " is manifest atlas texture")
		if not texture is AtlasTexture:
			continue
		var source_rect := Rect2(sprite.rect.x, sprite.rect.y, sprite.rect.w, sprite.rect.h)
		a.equal(texture.region, source_rect, key + " exact user crop")
		a.equal(texture.atlas.resource_path, "res://assets/theme/user-cards.png", key + " original user sheet")
		a.equal(texture.get_size(), source_rect.size, key + " original crop dimensions")
		var expected := original.get_region(Rect2i(source_rect))
		var actual := texture.get_image()
		expected.convert(Image.FORMAT_RGBA8)
		actual.convert(Image.FORMAT_RGBA8)
		a.truth(actual.get_data() == expected.get_data(), key + " actual pixels match imported original image")
		a.equal(assets.texture(key), texture, key + " cached texture identity")
	for key in ["background.home", "background.board"]:
		a.equal(assets.texture(key).resource_path, "res://assets/theme/" + key.trim_prefix("background.") + ".png", key + " source background")
	var mascot: Texture2D = assets.texture("character.home")
	a.equal(mascot.resource_path, "res://assets/character/reference-cutout-v1.png", "new radish identity")
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/theme/manifest.json"))
	for key in manifest.assets:
		if key.begins_with("character.") or key.begins_with("honor."):
			a.equal(assets.texture(key), mascot, key + " same approved radish placeholder")
	a.equal(assets.texture("character.future_variant"), mascot, "future character does not fall back to sheep")
	a.equal(assets.texture("honor.future_variant"), mascot, "future honor does not fall back to sheep")
	var heading: Font = assets.font()
	a.truth(heading != null, "source Chinese heading font loads")
	if heading != null:
		for glyph in "不乐个不广东萝卜每日挑战移出撤回洗牌胜利失败恢复设置排行榜好友话题装扮我的俱乐部":
			a.truth(heading.has_char(glyph.unicode_at(0)), "font contains " + glyph)
	a.equal(assets.font(), heading, "font cached")
	var icon_map: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/ui-icons/icon-map.json"))
	for key in icon_map:
		var texture: Texture2D = assets.icon(key)
		a.truth(texture != null, key + " native icon imported")
		if texture != null:
			a.equal(texture.resource_path, icon_map[key], key + " exact selected icon")
	a.equal(assets.texture("tile.UNKNOWN"), null, "missing art returns no invented icon")
	a.truth(assets.last_error.contains("tile.UNKNOWN"), "missing art has clear error")
	a.equal(assets.icon("unknown"), null, "missing icon returns null")
	a.truth(assets.last_error.contains("unknown"), "missing icon has clear error")
	var tile = tile_script.new()
	var second_tile = tile_script.new()
	tile.bind({"id": "first", "type": "T00"}, Rect2(0, 0, 48, 57), true)
	second_tile.bind({"id": "second", "type": "T00"}, Rect2(0, 0, 48, 57), true)
	a.equal(tile.icon_view.texture, second_tile.icon_view.texture, "cards share the atlas cache")
	second_tile.set_theme_assets(assets)
	second_tile.bind({"id": "second", "type": "T00"}, Rect2(0, 0, 48, 57), true)
	a.equal(second_tile.icon_view.texture, assets.texture("tile.T00"), "router can inject shared theme assets")
	second_tile.free()
	var supplied := {"id": "board-004", "type": "T00", "z": 2}
	var before := supplied.duplicate(true)
	var rect := Rect2(20, 40, 48, 57)
	tile.bind(supplied, rect, true)
	a.equal(supplied, before, "binding leaves authoritative tile untouched")
	a.equal(tile.tile_id, "board-004", "stable input tile identity")
	a.equal(tile.tile_type, "T00", "food type identity")
	a.equal(tile.logical_rect, rect, "logical rectangle is supplied rectangle")
	a.equal(tile.get_rect(), rect, "native control geometry matches supplied rectangle")
	a.equal(tile.mouse_filter, Control.MOUSE_FILTER_IGNORE, "router owns unified pointer input")
	a.equal(tile.visual.mouse_filter, Control.MOUSE_FILTER_IGNORE, "art cannot intercept pointer")
	a.equal(tile.icon_view.texture.region, Rect2(83, 32, 137, 277), "native card draws original T00 art")
	var picture: Rect2 = tile.icon_view.get_rect()
	a.truth(is_equal_approx(picture.size.x / picture.size.y, 137.0 / 277.0), "native artwork aspect preserved")
	a.truth(picture.size.x <= rect.size.x * .68 + .001 and picture.size.y <= rect.size.y * .70 + .001, "native artwork fits card safe area")
	a.equal(picture.get_center(), rect.size / 2.0, "native artwork centered")
	tile.set_visual_transform(Vector2(1.2, .9), Vector2(7, -4), .35)
	a.equal(tile.get_rect(), rect, "animation leaves native hit geometry unchanged")
	a.equal(tile.logical_rect, rect, "animation leaves authoritative logical rect unchanged")
	a.equal(tile.scale, Vector2.ONE, "tile root scale never animates")
	a.equal(tile.visual.scale, Vector2(1.2, .9), "visual child scales")
	a.equal(tile.visual.position, Vector2(7, -4), "visual child moves")
	a.truth(is_equal_approx(tile.visual.modulate.a, .35), "visual child fades")
	a.truth(Rect2(Vector2.ZERO, tile.size).has_point(Vector2(1, 1)), "native hit containment unaffected by child animation")
	a.equal(Rect2(Vector2.ZERO, tile.size).has_point(Vector2(-1, -1)), false, "visual animation does not expand logical hit area")
	tile.bind({"id": "side-001", "type": "T03"}, Rect2(10, 15, 55, 51), false)
	a.equal(tile.enabled, false, "blocked state stored")
	a.equal(tile.icon_view.modulate, Color("a6b594"), "blocked source artwork dims")
	a.equal(tile.frame.get_theme_stylebox("panel").bg_color, Color("d4dec5"), "blocked source palette frame")
	a.equal(tile.visual.scale, Vector2.ONE, "rebinding clears previous visual animation")
	a.equal(tile.visual.position, Vector2.ZERO, "rebinding clears previous visual offset")
	tile.bind({"id": "tiny", "type": "T01"}, Rect2(0, 0, 9, 8), true)
	a.equal(tile.get_rect().size, Vector2(9, 8), "small supplied geometry never enlarged silently")
	tile.bind({"id": "bad", "type": "UNKNOWN"}, rect, true)
	a.equal(tile.icon_view.texture, null, "invalid type clears previous food texture")
	a.truth(tile.missing_label.visible, "invalid type visibly marked")
	a.equal(tile.missing_label.text, "?", "fallback does not redraw a food icon")
	tile.free()
	return true
