extends Node

signal cue_started(name: String)

const CUES := ["click", "clear", "win", "fail"]

var _music: AudioStreamPlayer
var _cues: Dictionary = {}
var _events: Dictionary = {}
var _preferences := {"music": true, "sound": true}
var _scene := ""
var _modal := ""
var _visible := true
var _focused := true
var _resumed := true

func _ready() -> void:
	_ensure_players()
	_sync_music()

func apply_preferences(prefs: Dictionary) -> void:
	_ensure_players()
	for key in ["music", "sound"]:
		if typeof(prefs.get(key)) == TYPE_BOOL:
			_preferences[key] = prefs[key]
	if not _preferences.sound:
		_stop_cues()
	_sync_music()

func play_cue(name: String) -> void:
	_play(name)

# Only consume committed events. IDs must include round + revision + event
# index; tile IDs repeat legitimately after undo and are not event identities.
func play_event(name: String, event_id: String) -> bool:
	if event_id.is_empty() or name not in CUES or _events.has(event_id):
		return false
	_events[event_id] = true
	return _play(name)

func set_context(scene: String, modal: String, visible: bool) -> void:
	_ensure_players()
	_scene = scene
	_modal = modal
	_visible = visible
	if not _audible():
		_stop_cues()
	_sync_music()

func vibration_supported() -> bool:
	# Native Windows implementation has no vibration adapter. A preference
	# value is never evidence that platform feedback actually occurred.
	return false

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_focused = false
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_focused = true
	elif what == NOTIFICATION_APPLICATION_PAUSED:
		_resumed = false
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		_resumed = true
	else:
		return
	if not _audible():
		_stop_cues()
	_sync_music()

func _ensure_players() -> void:
	if is_instance_valid(_music):
		return
	_music = AudioStreamPlayer.new()
	_music.name = "Music"
	var source = load("res://assets/audio/music.wav")
	if source is AudioStreamWAV:
		var looping: AudioStreamWAV = source.duplicate()
		looping.loop_mode = AudioStreamWAV.LOOP_FORWARD
		looping.loop_begin = 0
		looping.loop_end = int(round(looping.get_length() * looping.mix_rate))
		_music.stream = looping
	add_child(_music)
	for cue in CUES:
		var player := AudioStreamPlayer.new()
		player.name = cue.capitalize()
		player.stream = load("res://assets/audio/" + cue + ".wav")
		add_child(player)
		_cues[cue] = player

func _play(name: String) -> bool:
	_ensure_players()
	if name not in CUES or not _preferences.sound or not _audible():
		return false
	var player: AudioStreamPlayer = _cues[name]
	if player.stream == null or not is_inside_tree():
		return false
	player.play()
	cue_started.emit(name)
	return true

func _audible() -> bool:
	return _visible and _focused and _resumed and not _scene.is_empty()

func _sync_music() -> void:
	if not is_instance_valid(_music):
		return
	var enabled: bool = _preferences.music and _audible() and _modal.is_empty()
	if enabled and not _music.has_stream_playback() and _music.stream != null and is_inside_tree():
		_music.play()
	_music.stream_paused = not enabled

func _stop_cues() -> void:
	for player in _cues.values():
		player.stop()
