extends RefCounted

# Matches the source stable serializer for representable, decoded JSON values.
# Godot's JSON parser replaces NUL and rejects unpaired UTF-16 surrogates;
# their original source text cannot be recovered by this encoder.
static func encode(value: Variant) -> String:
	if value is Dictionary:
		var keys: Array = value.keys()
		keys.sort_custom(_utf16_less)
		var parts: Array[String] = []
		for key in keys:
			parts.append(_quote(str(key)) + ":" + encode(value[key]))
		return "{" + ",".join(parts) + "}"
	if value is Array:
		var parts: Array[String] = []
		for item in value:
			parts.append(encode(item))
		return "[" + ",".join(parts) + "]"
	if value is String:
		return _quote(value)
	if value is float or value is int:
		return _number(float(value))
	return JSON.stringify(value)

# JS strings sort by UTF-16 code units, rather than Godot's UTF-32 code points.
static func _utf16_less(left: Variant, right: Variant) -> bool:
	var a := str(left).to_utf16_buffer()
	var b := str(right).to_utf16_buffer()
	for i in range(0, mini(a.size(), b.size()), 2):
		var x := a.decode_u16(i)
		var y := b.decode_u16(i)
		if x != y:
			return x < y
	return a.size() < b.size()

static func _quote(value: String) -> String:
	var result := '"'
	for i in range(value.length()):
		var code := value.unicode_at(i)
		match code:
			34: result += '\\"'
			92: result += '\\\\'
			8: result += '\\b'
			9: result += '\\t'
			10: result += '\\n'
			12: result += '\\f'
			13: result += '\\r'
			_:
				if code < 32 or (code >= 0xd800 and code <= 0xdfff):
					result += "\\u%04x" % code
				else:
					result += value[i]
	return result + '"'

# Find the shortest decimal in the double's exact round-to-nearest interval.
# Decimal big integers avoid overflowing int64 or losing subnormal precision.
# Choosing the closest decimal (ties to even) matches ECMAScript Number::toString.
static func _number(value: float) -> String:
	if not is_finite(value):
		return "null"
	if value == 0.0:
		return "0"
	if absf(value) <= 9007199254740991.0 and value == floor(value):
		return str(int(value))
	var sign_text := "-" if value < 0.0 else ""
	var bytes := PackedByteArray()
	bytes.resize(8)
	bytes.encode_double(0, absf(value))
	var bits := bytes.decode_u64(0)
	var exponent := int((bits >> 52) & 0x7ff)
	var mantissa := bits & 0xfffffffffffff
	var binary_power := -1074
	if exponent != 0:
		mantissa += 0x10000000000000
		binary_power = exponent - 1075
	var exact := _decimal(mantissa, binary_power)
	var lower: Dictionary
	if mantissa == 0x10000000000000 and exponent > 1:
		lower = _decimal(4 * mantissa - 1, binary_power - 2)
	else:
		lower = _decimal(2 * mantissa - 1, binary_power - 1)
	var upper := _decimal(2 * mantissa + 1, binary_power - 1)
	var inclusive := (mantissa & 1) == 0
	for count in range(1, 18):
		var candidate := _round_decimal(exact, count)
		var low := _compare_decimal(candidate, lower)
		var high := _compare_decimal(candidate, upper)
		# At powers of two the lower interval is narrower. The nearest decimal
		# can miss it while the adjacent decimal still fits at this precision.
		if low < 0 or (low == 0 and not inclusive):
			candidate = _round_decimal(exact, count, 1)
		elif high > 0 or (high == 0 and not inclusive):
			candidate = _round_decimal(exact, count, -1)
		low = _compare_decimal(candidate, lower)
		high = _compare_decimal(candidate, upper)
		if (low > 0 or (low == 0 and inclusive)) and (high < 0 or (high == 0 and inclusive)):
			return sign_text + _format_decimal(candidate)
	assert(false, "Every finite double has a shortest decimal within 17 digits")
	return "null"

@warning_ignore("integer_division")
static func _decimal(mantissa: int, binary_power: int) -> Dictionary:
	const BASE := 1000000000
	var limbs: Array[int] = []
	while mantissa > 0:
		limbs.append(mantissa % BASE)
		mantissa /= BASE
	var factor := 2 if binary_power >= 0 else 5
	for step in range(absi(binary_power)):
		var carry := 0
		for i in range(limbs.size()):
			var product := limbs[i] * factor + carry
			limbs[i] = product % BASE
			carry = product / BASE
		if carry != 0:
			limbs.append(carry)
	var digits := str(limbs[-1])
	for i in range(limbs.size() - 2, -1, -1):
		digits += str(limbs[i]).lpad(9, "0")
	return {"digits": digits, "point": digits.length() + mini(binary_power, 0)}

static func _round_decimal(exact: Dictionary, count: int, direction: int = 0) -> Dictionary:
	var digits: String = exact.digits
	var point: int = exact.point
	if digits.length() <= count:
		return exact
	var prefix := digits.left(count).to_int()
	var next := digits.unicode_at(count) - 48
	var tail_nonzero := not digits.substr(count + 1).replace("0", "").is_empty()
	var round_up := next > 5 or (next == 5 and (tail_nonzero or (prefix & 1) != 0))
	if direction != 0:
		round_up = direction > 0 and (next != 0 or tail_nonzero)
	if round_up:
		prefix += 1
	var rounded := str(prefix)
	if rounded.length() > count:
		point += 1
	return {"digits": rounded, "point": point}

static func _compare_decimal(left: Dictionary, right: Dictionary) -> int:
	if left.point != right.point:
		return -1 if left.point < right.point else 1
	var a: String = left.digits
	var b: String = right.digits
	var length := maxi(a.length(), b.length())
	a = a.rpad(length, "0")
	b = b.rpad(length, "0")
	return 0 if a == b else (-1 if a < b else 1)

static func _format_decimal(value: Dictionary) -> String:
	var digits: String = value.digits
	var point: int = value.point
	while digits.ends_with("0"):
		digits = digits.left(-1)
	if point > 0 and point <= 21:
		if point >= digits.length():
			return digits.rpad(point, "0")
		return digits.left(point) + "." + digits.substr(point)
	if point <= 0 and point > -6:
		return "0." + "0".repeat(-point) + digits
	var exponent := point - 1
	var coefficient := digits[0] + ("." + digits.substr(1) if digits.length() > 1 else "")
	return coefficient + "e" + ("+" if exponent >= 0 else "") + str(exponent)

static func snapshot_hash(deal: Dictionary) -> String:
	var cells: Array = []
	for c in deal.cells:
		cells.append([c.id, c.type, c.zone, c.rect.x, c.rect.y, c.rect.w, c.rect.h,
			c.get("z") if c.zone == "board" else null,
			c.get("stackId") if c.zone == "side" else null,
			c.get("position") if c.zone == "side" else null])
	return encode(["ASTRA_CONTENT_V1", deal.schema, deal.layoutId, deal.get("origin"), deal.slotCapacity, cells]).sha256_text()
