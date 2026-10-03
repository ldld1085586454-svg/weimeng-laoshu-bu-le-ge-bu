extends RefCounted

# Tracks active time only. Lifecycle callers own the modal/hidden/lost reasons;
# presentation animation does not pause this clock.
var _now: Callable
var _elapsed: int = 0
var _running: bool = false
var _pauses: Dictionary = {}
var _interval_start: int = 0
var _last_now: int = 0

func _init(now: Callable = Callable()) -> void:
	configure(now)

func configure(now: Callable) -> void:
	_now = now if now.is_valid() else func() -> int: return Time.get_ticks_msec()
	reset()

func reset(base_elapsed_ms: int = 0) -> void:
	_elapsed = maxi(0, base_elapsed_ms)
	_running = false
	_pauses.clear()
	_last_now = int(_now.call())
	_interval_start = _last_now

func start() -> void:
	if _running:
		return
	_running = true
	_interval_start = _monotonic_now()

func stop() -> void:
	if _active():
		_accrue()
	_running = false

func pause(reason: String) -> void:
	if _pauses.has(reason):
		return
	if _active():
		_accrue()
	_pauses[reason] = true

func resume(reason: String) -> void:
	if not _pauses.has(reason):
		return
	_pauses.erase(reason)
	if _active():
		_interval_start = _monotonic_now()

func elapsed_ms() -> int:
	if _active():
		return _elapsed + maxi(0, _monotonic_now() - _interval_start)
	return _elapsed

func _active() -> bool:
	return _running and _pauses.is_empty()

func _accrue() -> void:
	var current := _monotonic_now()
	_elapsed += maxi(0, current - _interval_start)
	_interval_start = current

func _monotonic_now() -> int:
	_last_now = maxi(_last_now, int(_now.call()))
	return _last_now
