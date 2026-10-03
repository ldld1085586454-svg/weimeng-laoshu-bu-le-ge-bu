extends RefCounted

const Memory = preload("res://tests/helpers/service_memory_store.gd")
const Service = preload("res://services/local_game_service.gd")
const Session = preload("res://session/session_controller.gd")
const Clock = preload("res://session/active_clock.gd")
const Codec = preload("res://storage/round_codec.gd")
const Atomic = preload("res://storage/atomic_store.gd")
var now := 1790956800000
var mono := 0

func run(a) -> bool:
	if not FileAccess.file_exists("res://services/settlement_queue.gd"):
		a.truth(false, "settlement queue implementation exists")
		return true
	var script = load("res://services/settlement_queue.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "settlement queue loads")
		return true
	var arguments := OS.get_cmdline_user_args()
	if "--settlement-restart" in arguments:
		var index := arguments.find("--settlement-restart")
		var disk := Atomic.new(arguments[index + 1])
		var recovered = script.new()
		recovered.configure(disk)
		a.equal(recovered.pending().payload, {"ticketId": "ticket", "log": "original-frozen-log", "elapsedMs": 123}, "real child process exact frozen outbox")
		print("SETTLEMENT RESTART exact original payload recovered")
		return true
	var store := Memory.new()
	var queue = script.new()
	queue.configure(store)
	a.equal(queue.status(), {"ok": true, "code": "OK"}, "empty queue status valid")
	var ticket := {"id": "ticket", "userId": "alice"}
	var payload := {"ticketId": "ticket", "log": "original-frozen-log", "elapsedMs": 123}
	store.fail_key = "outbox"
	store.fail_count = 1
	a.equal(queue.enqueue(payload, ticket).code, "WRITE_FAILED", "enqueue must persist before publishing")
	a.equal(queue.pending(), {}, "failed enqueue stays absent")
	a.truth(queue.enqueue(payload, ticket).ok, "enqueue persisted")
	payload.elapsedMs = 999
	ticket.id = "mutated"
	a.equal(queue.pending().payload.elapsedMs, 123, "outbox detaches input")
	a.equal(queue.pending().ticket.id, "ticket", "outbox ticket immutable")
	var detached: Dictionary = queue.pending()
	detached.payload.log = "mutated"
	a.equal(queue.pending().payload.log, "original-frozen-log", "pending detached output")
	var restarted = script.new()
	restarted.configure(store)
	a.equal(restarted.pending(), queue.pending(), "outbox survives process recreation")
	a.equal(restarted.enqueue({"ticketId": "ticket", "log": "different", "elapsedMs": 123}, queue.pending().ticket).code, "OUTBOX_CONFLICT", "existing payload cannot be overwritten")
	a.equal(restarted.enqueue(queue.pending().payload, queue.pending().ticket).code, "OK", "exact enqueue idempotent")
	var corrupt_store := Memory.new()
	corrupt_store.records.outbox = "{broken"
	var corrupt_queue = script.new()
	corrupt_queue.configure(corrupt_store)
	a.equal(corrupt_queue.status(), {"ok": false, "code": "INVALID_OUTBOX"}, "corrupt queue distinguished from empty")
	a.equal(corrupt_queue.enqueue(queue.pending().payload, queue.pending().ticket).code, "INVALID_OUTBOX", "corruption cannot be overwritten silently")
	var disk_path := ProjectSettings.globalize_path("res://.execution/service/restart-" + str(Time.get_ticks_usec()))
	var disk := Atomic.new(disk_path)
	var disk_queue = script.new()
	disk_queue.configure(disk)
	a.truth(disk_queue.enqueue(queue.pending().payload, queue.pending().ticket).ok, "real atomic outbox persisted")
	var output: Array = []
	var exit_code := OS.execute(OS.get_executable_path(), ["--headless", "--path", ProjectSettings.globalize_path("res://"), "--script", "res://tests/run.gd", "--", "--suite", "settlement", "--settlement-restart", disk_path], output, true)
	a.equal(exit_code, 0, "real child process restart exit")
	a.truth(str(output).contains("SETTLEMENT RESTART exact original payload recovered"), "real restart confirms frozen outbox")
	a.truth(_integration(a, script), "integration completed without runtime error")
	return true

func _integration(a, script) -> bool:
	var store := Memory.new()
	var service := Service.new()
	service.configure(store, func(): return now)
	var start: Dictionary = service.request("alice", "start", {"mode": "tutorial"}).data
	var session := Session.new()
	var clock := Clock.new()
	clock.configure(func(): return mono)
	a.truth(session.configure(start.deal, start.ticket.id, {"scope": "local", "ticket": start.ticket, "elapsedMs": 0, "settlementPending": false}, store, clock).ok, "real session configured")
	for cell in start.deal.cells:
		mono += 10
		a.truth(session.send("PICK", {"tileId": cell.id}).ok, "real terminal pick " + cell.id)
	var frozen: Dictionary = session.prepare_terminal().payload
	var queue = script.new()
	queue.configure(store, session)
	store.fail_key = "outbox"
	store.fail_count = 1
	a.equal(queue.enqueue(frozen, start.ticket).code, "WRITE_FAILED", "outbox creation failure after durable terminal")
	mono += 90000
	var recovered := Session.new()
	var clock2 := Clock.new()
	clock2.configure(func(): return mono)
	a.truth(recovered.restore(store.records.active, "local", now, store, clock2).ok, "terminal reconstructs after missing outbox")
	a.equal(recovered.prepare_terminal().payload, frozen, "terminal reconstruction retains exact log and elapsed")
	queue.configure(store, recovered)
	a.truth(queue.enqueue(recovered.prepare_terminal().payload, start.ticket).ok, "reconstructed outbox durable")
	# Accept once then simulate losing the response and local acknowledgement.
	a.truth(service.request("alice", "settle", frozen).ok, "service accepts before response loss")
	now = start.ticket.expiresAt + 1000
	store.fail_key = "active"
	store.fail_count = 1
	a.equal(queue.retry(service, "alice").code, "STORAGE_WRITE_FAILED", "accepted ack failure remains retryable across midnight")
	a.equal(queue.pending().payload, frozen, "ack failure retains frozen payload")
	a.equal(recovered.metadata().settlementAccepted, false, "failed accepted ack not published")
	# Fail the second active write (clear) after durable acceptance.
	store.fail_count = 0
	a.truth(recovered.mark_settlement_accepted().ok, "accepted ack durable")
	store.fail_count = 1
	a.equal(recovered.clear_after_settlement().code, "STORAGE_WRITE_FAILED", "active clear failure")
	a.equal(recovered.metadata().settlementPending, true, "active failure keeps pending gate")
	store.fail_key = "outbox"
	store.fail_count = 1
	a.equal(queue.retry(service, "alice").code, "WRITE_FAILED", "outbox cleanup failure after active clear")
	a.equal(store.records.active, "", "partial cleanup really cleared active")
	a.equal(queue.pending().payload, frozen, "partial cleanup retains original outbox")
	a.equal(recovered.metadata().settlementPending, true, "partial cleanup keeps gate")
	var restarted = script.new()
	restarted.configure(store)
	a.truth(restarted.retry(service, "alice").ok, "outbox alone completes accepted retry after restart midnight")
	a.equal(restarted.pending(), {}, "both cleanup phases remove pending")
	a.equal(store.records.outbox, "", "outbox durably cleared")
	a.equal(service.request("alice", "bootstrap", {}).data.history.records.size(), 1, "accepted retries never duplicate history")
	a.truth(queue.retry(service, "alice").ok, "attached in-memory pending can finish after restart cleanup")
	a.equal(recovered.snapshot(), {}, "session released only after both writes")
	# Different owner cannot accidentally submit or clean another user's outbox.
	var wrong = script.new()
	wrong.configure(Memory.new())
	a.truth(wrong.enqueue(frozen, start.ticket).ok, "wrong-owner test outbox")
	a.equal(wrong.retry(service, "bob").code, "TICKET_OWNER", "retry preserves ownership")
	a.equal(wrong.pending().payload, frozen, "owner rejection retains original")
	return true
