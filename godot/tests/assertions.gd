extends RefCounted

var checks := 0
var failures: Array[String] = []

func equal(actual: Variant, expected: Variant, label: String) -> void:
	checks += 1
	if not equivalent(actual, expected):
		failures.append(label + ": expected " + str(expected).left(300) + ", got " + str(actual).left(300))
		print("FAIL ", failures[-1])

# JSON numbers arrive as floats. Compare nested source-oracle structures by value.
func equivalent(actual: Variant, expected: Variant) -> bool:
	if actual is Array and expected is Array:
		if actual.size() != expected.size():
			return false
		for i in range(actual.size()):
			if not equivalent(actual[i], expected[i]):
				return false
		return true
	if actual is Dictionary and expected is Dictionary:
		if actual.size() != expected.size():
			return false
		for key in actual:
			if not expected.has(key) or not equivalent(actual[key], expected[key]):
				return false
		return true
	return actual == expected

func truth(value: Variant, label: String) -> void:
	equal(value, true, label)
