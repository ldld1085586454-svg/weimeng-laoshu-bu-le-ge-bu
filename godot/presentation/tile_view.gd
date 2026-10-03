extends Control
## Display-only native card. The router owns input and authoritative geometry.
## All motion is applied to the visual child; this Control stays at bind's rect.

const Assets = preload("res://presentation/theme_assets.gd")
const BLOCKED_TINT := Color("a6b594")
const BLOCKED_FILL := Color("d4dec5")
const CARD_BORDER := Color("94a47c")
const CARD_SHADOW := Color("9daf83")
static var _default_assets: RefCounted = Assets.new()

var tile_id := ""
var tile_type := ""
var enabled := false
var logical_rect := Rect2()
var visual: Control
var frame: Panel
var icon_view: TextureRect
var missing_label: Label
var _shadow: Panel
var _assets: RefCounted = _default_assets

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	focus_mode = Control.FOCUS_NONE
	clip_contents = false
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	visual = Control.new()
	visual.name = "Visual"
	visual.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(visual)
	_shadow = Panel.new()
	_shadow.name = "Shadow"
	_shadow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shadow.add_theme_stylebox_override("panel", _card_style(CARD_SHADOW, CARD_SHADOW, 0))
	visual.add_child(_shadow)
	frame = Panel.new()
	frame.name = "Frame"
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	visual.add_child(frame)
	icon_view = TextureRect.new()
	icon_view.name = "Food"
	icon_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon_view.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	visual.add_child(icon_view)
	missing_label = Label.new()
	missing_label.name = "MissingAsset"
	missing_label.text = "?"
	missing_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	missing_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	missing_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	missing_label.add_theme_color_override("font_color", Assets.INK)
	var heading: Font = _assets.font()
	if heading != null:
		missing_label.add_theme_font_override("font", heading)
	missing_label.hide()
	visual.add_child(missing_label)

## Call before bind to share the router's assets; the default is also shared
## by all card instances, including a full 720-tile board.
func set_theme_assets(shared: RefCounted) -> void:
	_assets = shared if shared != null else _default_assets
	var heading: Font = _assets.font()
	if heading != null:
		missing_label.add_theme_font_override("font", heading)

func bind(tile: Dictionary, rect: Rect2, is_enabled: bool) -> void:
	tile_id = str(tile.get("id", ""))
	tile_type = str(tile.get("type", ""))
	enabled = is_enabled
	logical_rect = rect
	position = rect.position
	size = rect.size
	visual.size = rect.size
	visual.pivot_offset = rect.size / 2.0
	set_visual_transform(Vector2.ONE, Vector2.ZERO, 1.0)
	_shadow.position = Vector2(0, 3)
	_shadow.size = rect.size
	frame.position = Vector2.ZERO
	frame.size = rect.size
	frame.add_theme_stylebox_override("panel", _card_style(Assets.CREAM if enabled else BLOCKED_FILL, CARD_BORDER, 1))
	icon_view.texture = _assets.texture("tile." + tile_type)
	icon_view.modulate = Color.WHITE if enabled else BLOCKED_TINT
	missing_label.position = Vector2.ZERO
	missing_label.size = rect.size
	missing_label.add_theme_font_size_override("font_size", maxi(8, int(rect.size.y * .4)))
	missing_label.visible = icon_view.texture == null
	if icon_view.texture != null:
		var dimensions := icon_view.texture.get_size()
		var fit := minf(rect.size.x * .68 / dimensions.x, rect.size.y * .70 / dimensions.y)
		icon_view.size = dimensions * fit
		icon_view.position = (rect.size - icon_view.size) / 2.0
	else:
		icon_view.size = Vector2.ZERO
		icon_view.position = Vector2.ZERO

func set_visual_transform(visual_scale: Vector2, offset: Vector2, opacity: float) -> void:
	visual.scale = visual_scale
	visual.position = offset
	visual.modulate = Color(1, 1, 1, clampf(opacity, 0.0, 1.0))

func _card_style(fill: Color, border: Color, border_width: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(border_width)
	box.set_corner_radius_all(5)
	return box
