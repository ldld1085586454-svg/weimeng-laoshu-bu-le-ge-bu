extends RefCounted

const Canonical = preload("res://rules/canonical_json.gd")
const Loader = preload("res://rules/deal_loader.gd")

func run(a: RefCounted) -> bool:
	var oracle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/canonical-edge.json"))
	for vector in oracle.vectors:
		var encoded := Canonical.encode(vector.value)
		a.equal(encoded, vector.encoded, "JS canonical " + vector.label)
		a.equal(encoded.sha256_text(), vector.sha256, "JS canonical hash " + vector.label)
	for vector in oracle.numberVectors:
		var value: float = vector.bits.hex_decode().decode_double(0)
		var encoded := Canonical.encode(value)
		a.equal(encoded, vector.encoded, "JS IEEE number " + vector.bits)
		a.equal(encoded.sha256_text(), vector.sha256, "JS IEEE hash " + vector.bits)
	a.equal(Canonical.snapshot_hash(oracle.deal), oracle.snapshotHash, "vertical tab snapshot hash matches JS")
	a.truth(Loader.validate_deal(oracle.deal).ok, "valid vertical tab deal accepts the JS snapshot hash")
	a.equal(Canonical.encode(-0.0), "0", "negative zero normalized")
	a.equal(Canonical.encode(9223372036854775807), "9223372036854776000", "int64 input uses JavaScript Number precision")
	a.equal(Canonical.encode(-9223372036854775807), "-9223372036854776000", "negative int64 input uses JavaScript Number precision")
	a.equal(Canonical.encode([INF, -INF, NAN]), "[null,null,null]", "nonfinite numbers use JSON null")
	return true
