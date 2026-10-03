extends RefCounted

class ManualTime extends RefCounted:
	var value: int = 1000
	func now() -> int:
		return value

func run(a: RefCounted) -> bool:
	if not FileAccess.file_exists("res://session/active_clock.gd"):
		a.truth(false, "active clock implementation exists")
		return true
	var script = load("res://session/active_clock.gd")
	if script == null or not script.can_instantiate():
		a.truth(false, "active clock loads")
		return true
	var time := ManualTime.new()
	var clock = script.new(time.now)
	a.equal(clock.elapsed_ms(), 0, "new clock is stopped at zero")
	clock.reset(50)
	time.value = 2000
	a.equal(clock.elapsed_ms(), 50, "reset base does not start clock")
	clock.start()
	time.value = 2200
	a.equal(clock.elapsed_ms(), 250, "active gameplay and pick animation time count")
	clock.start()
	time.value = 2300
	a.equal(clock.elapsed_ms(), 350, "duplicate start retains current interval")
	clock.pause("modal")
	time.value = 2500
	clock.pause("hidden")
	clock.pause("lost")
	clock.pause("modal")
	clock.resume("modal")
	clock.resume("unknown")
	time.value = 2900
	a.equal(clock.elapsed_ms(), 350, "closing modal cannot clear hidden or lost pauses")
	clock.resume("hidden")
	time.value = 3000
	a.equal(clock.elapsed_ms(), 350, "lost still pauses after visible")
	clock.resume("lost")
	time.value = 3200
	a.equal(clock.elapsed_ms(), 550, "last pause clearing resumes active interval")
	clock.stop()
	time.value = 8000
	clock.resume("lost")
	a.equal(clock.elapsed_ms(), 550, "terminal stop freezes throughout persistence and settlement retries")
	clock.pause("modal")
	clock.pause("hidden")
	clock.reset(125)
	clock.start()
	time.value = 8100
	a.equal(clock.elapsed_ms(), 225, "new round reset clears old pauses and active interval")
	time.value = 8050
	a.equal(clock.elapsed_ms(), 225, "clock rollback cannot subtract accumulated time")
	clock.pause("modal")
	time.value = 8090
	clock.resume("modal")
	time.value = 8110
	a.equal(clock.elapsed_ms(), 235, "rollback across pause boundaries does not count the same time twice")
	clock.reset(-1)
	a.equal(clock.elapsed_ms(), 0, "negative reset base is clamped")
	clock.pause("hidden")
	clock.start()
	time.value = 9000
	a.equal(clock.elapsed_ms(), 0, "starting while paused waits for resume")
	clock.resume("hidden")
	time.value = 9010
	a.equal(clock.elapsed_ms(), 10, "resume starts a clock that was started while paused")
	clock.stop()
	clock.stop()
	a.equal(clock.elapsed_ms(), 10, "duplicate stop remains frozen")
	return true
