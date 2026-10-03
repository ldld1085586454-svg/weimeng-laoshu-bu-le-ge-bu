extends SceneTree

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	var suite := "all"
	if "--suite" in args:
		var index := args.find("--suite")
		if index + 1 < args.size():
			suite = args[index + 1]
	var assertions = preload("res://tests/assertions.gd").new()
	var files := DirAccess.get_files_at("res://tests")
	var suites := 0
	for file in files:
		if file.begins_with("test_") and file.ends_with(".gd") and (suite == "all" or file == "test_" + suite + ".gd"):
			var test_script = load("res://tests/" + file)
			if test_script == null or not test_script.can_instantiate():
				assertions.truth(false, "load " + file)
				continue
			var failures_before: int = assertions.failures.size()
			var completed: Variant = await test_script.new().run(assertions)
			assertions.truth(typeof(completed) == TYPE_BOOL and completed == true, "suite completed " + file)
			if assertions.failures.size() == failures_before:
				print("PASS ", file.trim_prefix("test_").trim_suffix(".gd"))
			suites += 1
	assertions.truth(suites > 0, "requested suite exists")
	print("TEST RESULT suites=", suites, " checks=", assertions.checks, " failures=", assertions.failures.size())
	if suite == "all" and assertions.failures.is_empty():
		print("PASS all")
	await create_timer(0.5).timeout
	quit(0 if assertions.failures.is_empty() else 1)
