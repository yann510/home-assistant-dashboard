"""Authoritative approved mood recipes; the client selects only a mood ID."""
STRIP = 'light.living_room_led_strip'
BULBS = 'light.light_living_room_bulbs'
KITCHEN = 'light.light_kitchen'
NEON = 'light.neon_light_led_strip'
NEON_SPEED = 'number.neon_light_speed'
NEON_EFFECTS = {
    'love': 'N01:P10001FF3377F2100010019U3V3000640000E40088000000881664;',
    'unwind': 'N01:P10001FFAA44F2100010019U3V3000640000E1;',
    'dinner': 'N01:P10001FFC070F2100010019U3V3000640000E1;',
    'party': 'N01:P10001FFFFFFF2100010019U3V3100640000E3004BC2O6004B;',
}
NEON_BRIGHTNESS = {'love': 1000, 'unwind': 1000, 'dinner': 1000, 'party': 1000}
LIGHTS = {
    'love': {STRIP: {'rgb_color': [255,51,119], 'brightness':89}},
    'unwind': {STRIP: {'rgb_color': [255,170,68], 'brightness':64}, BULBS: {'brightness':64}},
    'dinner': {STRIP: {'rgb_color': [255,192,112], 'brightness':51}, BULBS: {'brightness':89}, KITCHEN: {'brightness':140}},
    'party': {STRIP: {'rgb_color': [170,68,255], 'brightness':178}, BULBS: {'brightness':64}, KITCHEN: {'brightness':102}},
}
