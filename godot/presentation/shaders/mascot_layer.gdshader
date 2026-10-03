shader_type canvas_item;
render_mode unshaded;

// The source PNG is unchanged. Runtime masks separate the leaf crown from the
// orange body; eyelids and a small sad mouth are drawn only during expressions.
varying vec4 item_modulate;
void vertex() {
	item_modulate = COLOR;
}

uniform bool leaves = false;
uniform float blink : hint_range(0.0, 1.0) = 0.0;
uniform float sad : hint_range(0.0, 1.0) = 0.0;

float ellipse(vec2 p, vec2 center, vec2 radius) {
	return length((p - center) / radius);
}

void fragment() {
	vec4 original = texture(TEXTURE, UV);
	float green = smoothstep(0.025, 0.09, original.g - max(original.r, original.b)) * (1.0 - step(0.425, UV.y));
	vec4 result = original;
	if (leaves) {
		result.a *= green;
	} else {
		result.a *= 1.0 - green;
		// Match the orange surface at the same height, away from facial ink.
		vec3 orange = texture(TEXTURE, vec2(0.255, clamp(UV.y, 0.53, 0.88))).rgb;
		float left_eye = ellipse(UV, vec2(0.422, 0.596), vec2(0.077, 0.086));
		float right_eye = ellipse(UV, vec2(0.578, 0.599), vec2(0.074, 0.086));
		float eye_mask = 1.0 - smoothstep(0.96, 1.06, min(left_eye, right_eye));
		float closed = max(blink, sad * 0.68);
		float lid_y = mix(0.509, 0.682, closed);
		float lid = (1.0 - smoothstep(lid_y - 0.006, lid_y + 0.006, UV.y)) * eye_mask * step(0.001, closed);
		result.rgb = mix(result.rgb, orange, lid);
		if (blink > 0.8) {
			float line = 1.0 - smoothstep(0.003, 0.008, abs(UV.y - 0.608));
			float within_eye = step(abs(UV.x - 0.421), 0.052) + step(abs(UV.x - 0.579), 0.049);
			result.rgb = mix(result.rgb, vec3(0.15, 0.14, 0.13), line * clamp(within_eye, 0.0, 1.0) * smoothstep(0.8, 1.0, blink));
		}
		if (sad > 0.0) {
			// Erase every original mouth ink/tongue pixel, including both smile corners.
			// The upper-left hook has its own strip, clear of the original eye whites.
			float mouth_bounds = step(0.690, UV.y) * step(UV.y, 0.95) * step(0.31, UV.x) * step(UV.x, 0.68);
			float hook = step(0.674, UV.y) * step(UV.y, 0.72) * step(0.31, UV.x) * step(UV.x, 0.37);
			float mouth_ink = clamp((1.0 - original.r) * 12.0 + original.b * 12.0, 0.0, 1.0);
			float mouth_area = max(mouth_bounds, hook) * mouth_ink;
			vec3 mouth_orange = texture(TEXTURE, vec2(0.255, clamp(UV.y, 0.53, 0.88))).rgb;
			result.rgb = mix(result.rgb, mouth_orange, mouth_area * sad);
			float mouth_curve = 0.811 + 1.5 * pow(UV.x - 0.493, 2.0);
			float line = (1.0 - smoothstep(0.005, 0.009, abs(UV.y - mouth_curve))) * (1.0 - smoothstep(0.068, 0.076, abs(UV.x - 0.493)));
			result.rgb = mix(result.rgb, vec3(0.16, 0.145, 0.13), line * sad);
		}
	}
	COLOR = result * item_modulate;
}
