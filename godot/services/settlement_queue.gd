extends RefCounted

const Canonical = preload("res://rules/canonical_json.gd")
const KEY := "outbox"
var _store: RefCounted
var _session: RefCounted
var _pending: Dictionary = {}
var _load_code := "NOT_CONFIGURED"

func configure(store: RefCounted, session: RefCounted = null) -> void:
	_store = store
	_session = session
	_pending = {}
	_load_code = "OK"
	var saved: Dictionary = _store.read(KEY)
	if not saved.ok:
		if saved.code != "MISSING":
			_load_code = saved.code
		return
	if saved.text.is_empty():
		return
	var parser := JSON.new()
	if parser.parse(saved.text) != OK:
		_load_code = "INVALID_OUTBOX"
		return
	var parsed: Variant = parser.data
	if not parsed is Dictionary or not _valid(parsed.get("payload"), parsed.get("ticket")):
		_load_code = "INVALID_OUTBOX"
		return
	_pending = parsed

func enqueue(payload: Dictionary, ticket: Dictionary) -> Dictionary:
	if _load_code != "OK":
		return _result(false, _load_code)
	if not _valid(payload, ticket):
		return _result(false, "INVALID_PAYLOAD")
	var candidate := {"payload": payload.duplicate(true), "ticket": ticket.duplicate(true)}
	if not _pending.is_empty():
		return _result(true, "OK") if Canonical.encode(candidate) == Canonical.encode(_pending) else _result(false, "OUTBOX_CONFLICT")
	var saved: Dictionary = _store.write(KEY, JSON.stringify(candidate))
	if not saved.ok:
		return _result(false, saved.code)
	_pending = candidate
	return _result(true, "OK")

func pending() -> Dictionary:
	return _pending.duplicate(true)

func status() -> Dictionary:
	return {"ok": _load_code == "OK", "code": _load_code}

func retry(service: RefCounted, user_id: String) -> Dictionary:
	if _load_code != "OK":
		return _result(false, _load_code)
	if _pending.is_empty():
		return _result(false, "NO_PENDING_SETTLEMENT")
	var accepted: Dictionary = service.request(user_id, "settle", _pending.payload.duplicate(true))
	if not accepted.ok:
		return accepted
	if _session != null:
		var ack: Dictionary = _session.mark_settlement_accepted()
		if not ack.ok:
			return _result(false, ack.code)
		var cleared: Dictionary = _session.clear_after_settlement()
		if not cleared.ok:
			return _result(false, cleared.code)
	else:
		var cleared: Dictionary = _store.write("active", "")
		if not cleared.ok:
			return _result(false, cleared.code)
	var cleared_outbox: Dictionary = _store.write(KEY, "")
	if not cleared_outbox.ok:
		return _result(false, cleared_outbox.code)
	_pending = {}
	if _session != null:
		_session.finish_settlement_cleanup()
	return accepted

func _valid(payload: Variant, ticket: Variant) -> bool:
	return payload is Dictionary and ticket is Dictionary and payload.size() == 3 and payload.get("ticketId") is String and payload.get("log") is String and payload.has("elapsedMs") and ticket.get("id") == payload.ticketId and ticket.get("userId") is String

func _result(ok: bool, code: String) -> Dictionary:
	return {"ok": ok, "code": code, "data": {}}
