extends RefCounted
## Native asset lookup. Character roles share the unchanged source texture;
## MascotView adds layered motion and cosmetic variants. No legacy sheep art.

const MANIFEST_PATH := "res://assets/theme/manifest.json"
const ICON_MAP_PATH := "res://assets/ui-icons/icon-map.json"
const MASCOT_PATH := "res://assets/character/reference-cutout-v1.png"
const INK := Color("254332")
const GRASS := Color("f2f6e9")
const CREAM := Color("fffcf3")
const MUTED := Color("78836e")
const GREEN := Color("577457")
const BORDER := Color("bec9ac")
const YELLOW := Color("f6c95e")

var last_error := ""
var _manifest: Dictionary = {}
var _icon_paths: Dictionary = {}
var _textures: Dictionary = {}
var _heading: Font

func _init() -> void:
	_manifest = _read_dictionary(MANIFEST_PATH)
	_icon_paths = _read_dictionary(ICON_MAP_PATH)

func texture(asset_key: String) -> Texture2D:
	last_error = ""
	# Also covers future role keys, so an unapproved role cannot reveal old art.
	if asset_key.begins_with("character.") or asset_key.begins_with("honor."):
		return _source_texture(MASCOT_PATH)
	if _textures.has(asset_key):
		return _textures[asset_key]
	var assets: Dictionary = _manifest.get("assets", {})
	if not assets.has(asset_key):
		last_error = "Missing theme asset: " + asset_key
		return null
	var entry: Dictionary = assets[asset_key]
	var source := _source_texture(_resource_path(entry.get("src", "")))
	if source == null:
		return null
	var result: Texture2D = source
	if entry.has("rect"):
		var crop: Dictionary = entry.rect
		var region := Rect2(crop.get("x", 0), crop.get("y", 0), crop.get("w", 0), crop.get("h", 0))
		if region.size.x <= 0 or region.size.y <= 0 or not Rect2(Vector2.ZERO, source.get_size()).encloses(region):
			last_error = "Invalid theme crop: " + asset_key
			return null
		var atlas := AtlasTexture.new()
		atlas.atlas = source
		atlas.region = region
		atlas.filter_clip = true
		result = atlas
	_textures[asset_key] = result
	return result

func font() -> Font:
	last_error = ""
	if _heading != null:
		return _heading
	var fonts: Dictionary = _manifest.get("fonts", {})
	var heading: Dictionary = fonts.get("heading", {})
	var path := _resource_path(heading.get("src", ""))
	if not ResourceLoader.exists(path):
		last_error = "Missing theme heading font: " + path
		return null
	_heading = load(path) as Font
	if _heading == null:
		last_error = "Invalid theme heading font: " + path
	return _heading

func icon(key: String) -> Texture2D:
	last_error = ""
	if not _icon_paths.has(key):
		last_error = "Missing UI icon: " + key
		return null
	return _source_texture(_resource_path(_icon_paths[key]))

func _source_texture(path: String) -> Texture2D:
	if _textures.has(path):
		return _textures[path]
	if not ResourceLoader.exists(path):
		last_error = "Missing texture source: " + path
		return null
	var result := load(path) as Texture2D
	if result == null:
		last_error = "Invalid texture source: " + path
		return null
	_textures[path] = result
	return result

func _resource_path(path: String) -> String:
	return path if path.begins_with("res://") else "res://" + path

func _read_dictionary(path: String) -> Dictionary:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary:
		return parsed
	last_error = "Invalid asset manifest: " + path
	return {}
