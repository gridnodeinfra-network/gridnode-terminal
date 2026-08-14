#!/usr/bin/env python3
"""Deterministically derive the locked GRID//NODE v2 asset system."""

from __future__ import annotations

import hashlib
import html
import json
import math
import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "scripts/brand-reference-contract.json"
SOURCE = ROOT / "assets/brand/source/GRIDNODE-BRAND-SYSTEM-v2-APPROVED.png"
BRAND = ROOT / "assets/brand"
PROOF = BRAND / "proof"
CONTRACT = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
COLOR_ORDER = ("mars_red", "cyber_cyan", "signal_yellow", "white")
COMPONENT_RULES = {
    "core": {
        "mars_red": {"min_area": 600, "x": (20, 300), "y": (10, 260)},
        "cyber_cyan": {"min_area": 1000, "x": (80, 350), "y": (30, 290)},
        "white": {"min_area": 300, "x": (130, 260), "y": (80, 220)},
    },
    "wordmark": {
        "mars_red": {"min_area": 50, "x": (20, 190), "y": (24, 58)},
        "cyber_cyan": {"min_area": 70, "x": (170, 355), "y": (24, 58)},
    },
}
SOURCE_CELL_STROKE = {"core": 1.0, "wordmark": 0.55}


def canonical_sha256(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("ascii")).hexdigest()


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fmt(value: float) -> str:
    rounded = round(float(value), 3)
    if abs(rounded) < 0.0005:
        rounded = 0.0
    return f"{rounded:.3f}".rstrip("0").rstrip(".")


def locked_rgb(name: str) -> tuple[int, int, int]:
    value = CONTRACT["colors"][name].lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def source_mask(crop: Image.Image, color_name: str) -> np.ndarray:
    hsv = np.asarray(crop.convert("HSV"))
    hue, saturation, value = (hsv[:, :, index] for index in range(3))
    rule = CONTRACT["hsv_masks"][color_name]
    hue_match = np.zeros(hue.shape, dtype=bool)
    for low, high in rule["hue_ranges"]:
        hue_match |= (hue >= low) & (hue <= high)
    return (
        hue_match
        & (saturation >= rule.get("min_saturation", 0))
        & (saturation <= rule.get("max_saturation", 255))
        & (value >= rule.get("min_value", 0))
        & (value <= rule.get("max_value", 255))
    ).astype(np.uint8)


def filtered_mask(raw: np.ndarray, rule: dict) -> np.ndarray:
    kernel = np.ones((3, 3), dtype=np.uint8)
    cleaned = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, kernel, iterations=1)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel, iterations=1)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(cleaned, 8)
    accepted_cleaned = np.zeros_like(cleaned)
    for index in range(1, count):
        area = int(stats[index, cv2.CC_STAT_AREA])
        center_x, center_y = centroids[index]
        if area < rule["min_area"]:
            continue
        if not (rule["x"][0] <= center_x <= rule["x"][1] and rule["y"][0] <= center_y <= rule["y"][1]):
            continue
        accepted_cleaned[labels == index] = 1
    raw_count, raw_labels, raw_stats, raw_centroids = cv2.connectedComponentsWithStats(raw, 8)
    output = np.zeros_like(raw)
    for index in range(1, raw_count):
        area = int(raw_stats[index, cv2.CC_STAT_AREA])
        center_x, center_y = raw_centroids[index]
        component = raw_labels == index
        if area < rule["min_area"]:
            continue
        if not (rule["x"][0] <= center_x <= rule["x"][1] and rule["y"][0] <= center_y <= rule["y"][1]):
            continue
        if np.any(component & accepted_cleaned.astype(bool)):
            output[component] = 1
    return output


def contour_ring(contour: np.ndarray, transform) -> list[tuple[float, float]]:
    perimeter = cv2.arcLength(contour, True)
    approximated = cv2.approxPolyDP(contour, 0.0015 * perimeter, True)
    points = [transform(float(point[0][0]), float(point[0][1])) for point in approximated]
    deduplicated: list[tuple[float, float]] = []
    for point in points:
        rounded = (round(point[0], 3), round(point[1], 3))
        if not deduplicated or rounded != deduplicated[-1]:
            deduplicated.append(rounded)
    if len(deduplicated) > 1 and deduplicated[0] == deduplicated[-1]:
        deduplicated.pop()
    if len(set(deduplicated)) < 3:
        raise RuntimeError("traced contour collapsed below three points")
    return deduplicated


def trace_geometry(kind: str, crop: Image.Image, target: tuple[int, int]) -> tuple[list[dict], dict, dict[str, np.ndarray]]:
    raw_masks = {name: source_mask(crop, name) for name in COLOR_ORDER}
    selected_masks: dict[str, np.ndarray] = {}
    for color_name, rule in COMPONENT_RULES[kind].items():
        selected_masks[color_name] = filtered_mask(raw_masks[color_name], rule)
        if not selected_masks[color_name].any():
            raise RuntimeError(f"locked {kind}/{color_name} component filter selected nothing")

    union = np.zeros((crop.height, crop.width), dtype=np.uint8)
    for mask in selected_masks.values():
        union |= mask
    ys, xs = np.nonzero(union)
    minimum_x, maximum_x = int(xs.min()), int(xs.max())
    minimum_y, maximum_y = int(ys.min()), int(ys.max())
    span_x = max(1.0, float(maximum_x - minimum_x))
    span_y = max(1.0, float(maximum_y - minimum_y))
    scale = min(target[0] / span_x, target[1] / span_y)
    pad_x = (target[0] - span_x * scale) / 2.0
    pad_y = (target[1] - span_y * scale) / 2.0

    def normalize(x: float, y: float) -> tuple[float, float]:
        return ((x - minimum_x) * scale + pad_x, (y - minimum_y) * scale + pad_y)

    components: list[dict] = []
    for color_name in COLOR_ORDER:
        mask = selected_masks.get(color_name)
        if mask is None:
            continue
        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hierarchy is None:
            continue
        hierarchy = hierarchy[0]
        outers = []
        for index, contour in enumerate(contours):
            if hierarchy[index][3] != -1:
                continue
            moments = cv2.moments(contour)
            center_x = moments["m10"] / moments["m00"] if moments["m00"] else 0.0
            center_y = moments["m01"] / moments["m00"] if moments["m00"] else 0.0
            outers.append((center_x, center_y, index))
        for ordinal, (_center_x, _center_y, index) in enumerate(sorted(outers)):
            rings = [contour_ring(contours[index], normalize)]
            child = hierarchy[index][2]
            while child != -1:
                rings.append(contour_ring(contours[child], normalize))
                child = hierarchy[child][0]
            components.append(
                {
                    "component": f"{kind}-{color_name.replace('_', '-')}-{ordinal:02d}",
                    "color": color_name,
                    "rings": rings,
                    "stroke_width": round(scale * SOURCE_CELL_STROKE[kind], 3),
                }
            )

    components.sort(key=lambda item: (COLOR_ORDER.index(item["color"]), item["component"]))
    geometry = {
        "minimum_x": minimum_x,
        "minimum_y": minimum_y,
        "maximum_x": maximum_x,
        "maximum_y": maximum_y,
        "span_x": span_x,
        "span_y": span_y,
        "scale": scale,
        "pad_x": pad_x,
        "pad_y": pad_y,
        "target": list(target),
    }
    return components, geometry, raw_masks


def ring_path(ring: list[tuple[float, float]]) -> str:
    first, *rest = ring
    return " ".join([f"M {fmt(first[0])} {fmt(first[1])}"] + [f"L {fmt(x)} {fmt(y)}" for x, y in rest] + ["Z"])


def component_path(component: dict) -> str:
    return " ".join(ring_path(ring) for ring in component["rings"])


def geometry_payload(components: list[dict]) -> list[dict]:
    payload = [
        {
            "component": component["component"],
            "tag": "path",
            "rings": component["rings"],
        }
        for component in components
    ]
    return sorted(payload, key=lambda item: (item["component"], item["tag"], item["rings"]))


def geometry_hash(components: list[dict]) -> str:
    return canonical_sha256(geometry_payload(components))


def master_hash(hashes: dict[str, str]) -> str:
    return canonical_sha256(hashes)


def paths_markup(kind: str, components: list[dict], fill_override: str | None = None) -> str:
    lines = []
    for component in components:
        fill = fill_override or CONTRACT["colors"][component["color"]]
        lines.append(
            f'<path data-gn-geometry="{kind}" data-gn-component="{component["component"]}" '
            f'fill="{fill}" stroke="{fill}" stroke-width="{fmt(component["stroke_width"])}" '
            f'stroke-linejoin="miter" fill-rule="evenodd" d="{component_path(component)}"/>'
        )
    return "\n".join(lines)


def svg_document(
    title: str,
    view_box: tuple[float, float, float, float],
    body: str,
    hashes: dict[str, str],
    width: int | None = None,
    height: int | None = None,
) -> str:
    attributes = [
        'xmlns="http://www.w3.org/2000/svg"',
        f'viewBox="{" ".join(fmt(value) for value in view_box)}"',
        'role="img"',
        f'aria-label="{html.escape(title)}"',
        f'data-gn-source-sha256="{CONTRACT["source_sha256"]}"',
        f'data-gn-master-hash="{master_hash(hashes)}"',
    ]
    for kind, digest in sorted(hashes.items()):
        attributes.append(f'data-gn-{kind}-geometry-sha256="{digest}"')
    if width is not None:
        attributes.append(f'width="{width}"')
    if height is not None:
        attributes.append(f'height="{height}"')
    return f'<svg {" ".join(attributes)}>\n<title>{html.escape(title)}</title>\n{body}\n</svg>\n'


def write_text(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def write_svg(relative: str, title: str, view_box: tuple[float, float, float, float], body: str, hashes: dict[str, str]) -> None:
    write_text(relative, svg_document(title, view_box, body, hashes))


def recolor_for_signature(components: list[dict]) -> list[dict]:
    recolored = []
    for component in components:
        copy = dict(component)
        if component["color"] == "white":
            copy["color"] = "signal_yellow"
        recolored.append(copy)
    return recolored


def write_reference(path: Path, raw_masks: dict[str, np.ndarray], colors: tuple[str, ...]) -> None:
    height, width = next(iter(raw_masks.values())).shape
    output = np.zeros((height, width, 4), dtype=np.uint8)
    for color_name in colors:
        mask = raw_masks[color_name].astype(bool)
        output[mask, :3] = locked_rgb(color_name)
        output[mask, 3] = 255
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(output, "RGBA").save(path, optimize=False, compress_level=9)


def proof_svg(kind: str, components: list[dict], geometry: dict, crop_size: tuple[int, int], hashes: dict[str, str]) -> str:
    inverse = 1.0 / geometry["scale"]
    translate_x = geometry["minimum_x"] + 0.5 - geometry["pad_x"] * inverse
    translate_y = geometry["minimum_y"] + 0.5 - geometry["pad_y"] * inverse
    body = (
        f'<g transform="translate({fmt(translate_x)} {fmt(translate_y)}) scale({fmt(inverse)})">\n'
        f'{paths_markup(kind, components)}\n</g>'
    )
    return svg_document(f"GRID//NODE {kind} fidelity proof", (0, 0, crop_size[0], crop_size[1]), body, hashes, crop_size[0], crop_size[1])


def expanded_icon_view_box(geometry: dict, raw_masks: dict[str, np.ndarray]) -> tuple[float, float, float, float]:
    white = raw_masks["white"].astype(np.uint8)
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(white, 8)
    widths = [int(stats[index, cv2.CC_STAT_WIDTH]) for index in range(1, count) if stats[index, cv2.CC_STAT_AREA] > 2]
    if not widths:
        raise RuntimeError("white operator clear-space component is missing")
    clear_space_source = max(widths)
    clear_space_normalized = clear_space_source * geometry["scale"]
    side = max(geometry["span_x"] * geometry["scale"] + 2 * clear_space_normalized, geometry["span_y"] * geometry["scale"] + 2 * clear_space_normalized)
    target_width, target_height = geometry["target"]
    return ((target_width - side) / 2, (target_height - side) / 2, side, side)


def maskable_view_box(geometry: dict, raw_masks: dict[str, np.ndarray]) -> tuple[float, float, float, float]:
    union = np.zeros_like(next(iter(raw_masks.values())))
    for name in ("mars_red", "cyber_cyan", "white"):
        union |= raw_masks[name]
    ys, xs = np.nonzero(union)
    center_x = (float(xs.min()) + float(xs.max())) / 2
    center_y = (float(ys.min()) + float(ys.max())) / 2
    radial = max(math.hypot(float(x) - center_x, float(y) - center_y) for x, y in zip(xs, ys))
    side_source = 2 * radial / 0.385
    side = side_source * geometry["scale"]
    normalized_center_x = (center_x - geometry["minimum_x"]) * geometry["scale"] + geometry["pad_x"]
    normalized_center_y = (center_y - geometry["minimum_y"]) * geometry["scale"] + geometry["pad_y"]
    return (normalized_center_x - side / 2, normalized_center_y - side / 2, side, side)


def write_asset_svgs(core: list[dict], wordmark: list[dict], core_hash: str, wordmark_hash: str, icon_view_box) -> None:
    core_paths = paths_markup("core", core)
    signature_core = paths_markup("core", recolor_for_signature(core))
    wordmark_paths = paths_markup("wordmark", wordmark)
    core_only = {"core": core_hash}
    wordmark_only = {"wordmark": wordmark_hash}
    combined = {"core": core_hash, "wordmark": wordmark_hash}

    write_svg("assets/brand/master/gridnode-core-mark.svg", "GRID//NODE core mark", (0, 0, 1000, 1000), core_paths, core_only)
    write_svg("assets/brand/master/gridnode-wordmark.svg", "GRID//NODE wordmark", (0, 0, 4000, 700), wordmark_paths, wordmark_only)
    horizontal = (
        f'<g transform="translate(0 200) scale(1)">\n{signature_core}\n</g>\n'
        f'<g transform="translate(1200 280) scale(1.2)">\n{wordmark_paths}\n</g>'
    )
    write_svg("assets/brand/master/gridnode-lockup-horizontal.svg", "GRID//NODE horizontal lockup", (0, 0, 6200, 1400), horizontal, combined)
    stacked = (
        f'<g transform="translate(1200 0) scale(1.6)">\n{signature_core}\n</g>\n'
        f'<g transform="translate(300 1700) scale(0.85)">\n{wordmark_paths}\n</g>'
    )
    write_svg("assets/brand/master/gridnode-lockup-stacked.svg", "GRID//NODE stacked lockup", (0, 0, 4000, 2400), stacked, combined)
    write_svg(
        "assets/brand/master/gridnode-core-mark-mono-white.svg",
        "GRID//NODE monochrome white core mark",
        (0, 0, 1000, 1000),
        paths_markup("core", core, CONTRACT["colors"]["white"]),
        core_only,
    )
    write_svg(
        "assets/brand/master/gridnode-core-mark-mono-black.svg",
        "GRID//NODE monochrome black core mark",
        (0, 0, 1000, 1000),
        paths_markup("core", core, CONTRACT["colors"]["black"]),
        core_only,
    )
    write_svg("assets/brand/icons/favicon.svg", "GRID//NODE app icon", icon_view_box, signature_core, core_only)
    write_svg("assets/brand/ui/header-lockup.svg", "GRID//NODE header lockup", (0, 0, 6200, 1400), horizontal, combined)
    write_svg("assets/brand/ui/boot-mark.svg", "GRID//NODE startup mark", (0, 0, 1000, 1000), signature_core, core_only)
    scanner = f'<rect data-gn-presentation="true" x="30" y="30" width="940" height="940" rx="150" fill="none" stroke="{CONTRACT["colors"]["cyber_cyan"]}"/>\n{signature_core}'
    write_svg("assets/brand/ui/scanner-badge.svg", "GRID//NODE scanner badge", (0, 0, 1000, 1000), scanner, core_only)
    update = f'<rect data-gn-presentation="true" x="55" y="55" width="890" height="890" rx="445" fill="{CONTRACT["colors"]["black_mars"]}" stroke="{CONTRACT["colors"]["mars_red"]}"/>\n{signature_core}'
    write_svg("assets/brand/ui/update-badge.svg", "GRID//NODE update badge", (0, 0, 1000, 1000), update, core_only)
    watermark = (
        f'<g opacity="0.16" transform="translate(0 200) scale(1)">\n{signature_core}\n</g>\n'
        f'<g opacity="0.16" transform="translate(1200 280) scale(1.2)">\n{wordmark_paths}\n</g>'
    )
    write_svg("assets/brand/ui/watermark.svg", "GRID//NODE watermark", (0, 0, 6200, 1400), watermark, combined)


def write_render_sources(core: list[dict], core_hash: str, icon_view_box, safe_view_box) -> None:
    signature = paths_markup("core", recolor_for_signature(core))
    write_text(
        "assets/brand/proof/icon-standard-source.svg",
        svg_document("GRID//NODE standard icon source", icon_view_box, signature, {"core": core_hash}),
    )
    background = CONTRACT["colors"]["black_mars"]
    maskable = f'<rect x="{fmt(safe_view_box[0])}" y="{fmt(safe_view_box[1])}" width="{fmt(safe_view_box[2])}" height="{fmt(safe_view_box[3])}" fill="{background}"/>\n{signature}'
    write_text(
        "assets/brand/proof/icon-maskable-source.svg",
        svg_document("GRID//NODE maskable icon source", safe_view_box, maskable, {"core": core_hash}),
    )


def output_manifest(core_hash: str, wordmark_hash: str) -> None:
    outputs = []
    svg_map = CONTRACT["svg_output_geometry"]
    for value in CONTRACT["manifest_required_output_paths"]:
        if value in svg_map:
            uses_core = svg_map[value]["uses_core"]
            uses_wordmark = svg_map[value]["uses_wordmark"]
        else:
            uses_core = True
            uses_wordmark = False
        hashes = {}
        item = {"path": value, "uses_core": uses_core, "uses_wordmark": uses_wordmark}
        if uses_core:
            hashes["core"] = core_hash
            item["core_geometry_sha256"] = core_hash
        if uses_wordmark:
            hashes["wordmark"] = wordmark_hash
            item["wordmark_geometry_sha256"] = wordmark_hash
        item["master_geometry_sha256"] = master_hash(hashes)
        outputs.append(item)
    manifest = {
        "canonical_name": CONTRACT["canonical_name"],
        "source_sha256": CONTRACT["source_sha256"],
        "source_size": CONTRACT["source_size"],
        "opencv_version": cv2.__version__,
        "pillow_version": Image.__version__,
        "numpy_version": np.__version__,
        "core_geometry_sha256": core_hash,
        "wordmark_geometry_sha256": wordmark_hash,
        "outputs": outputs,
    }
    write_text("assets/brand/brand-manifest.json", json.dumps(manifest, indent=2, ensure_ascii=True) + "\n")


def make_difference(reference: Path, rendered: Path, output: Path) -> None:
    with Image.open(reference) as left_source, Image.open(rendered) as right_source:
        left = left_source.convert("RGBA")
        right = right_source.convert("RGBA")
    difference = ImageChops.difference(left, right)
    difference.save(output, optimize=False, compress_level=9)


def make_contact_sheet() -> None:
    canvas = Image.new("RGB", (1024, 320), locked_rgb("deep_navy"))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    sizes = (16, 24, 32, 48, 64, 192, 512)
    x = 20
    for size in sizes:
        path = PROOF / f"icon-{size}.png"
        with Image.open(path) as source:
            icon = source.convert("RGBA")
        display = min(size, 112)
        if icon.size != (display, display):
            icon = icon.resize((display, display), Image.Resampling.LANCZOS)
        for row, background in enumerate((locked_rgb("black_mars"), (255, 255, 255))):
            tile = Image.new("RGBA", (128, 128), background + (255,))
            tile.alpha_composite(icon, ((128 - display) // 2, (128 - display) // 2))
            canvas.paste(tile.convert("RGB"), (x, 22 + row * 146))
        draw.text((x + 4, 2), f"{size}px", fill=locked_rgb("steel_gray"), font=font)
        x += 140
    canvas.save(PROOF / "small-size-contact-sheet.png", optimize=False, compress_level=9)


def make_safe_zone_proof() -> None:
    with Image.open(BRAND / "icons/pwa-maskable-512.png") as source:
        image = source.convert("RGBA")
    draw = ImageDraw.Draw(image)
    margin = int(round(512 * 0.1))
    draw.ellipse((margin, margin, 512 - margin - 1, 512 - margin - 1), outline=locked_rgb("signal_yellow") + (255,), width=2)
    image.save(PROOF / "maskable-safe-zone.png", optimize=False, compress_level=9)


def normalize_transparent_icons() -> None:
    for relative in CONTRACT["transparent_png"]:
        path = ROOT / relative
        required = [locked_rgb(name) for name in CONTRACT["png_color_requirements"][relative]]
        with Image.open(path) as source:
            image = source.convert("RGBA")
        normalized = []
        candidates: dict[tuple[int, int, int], list[tuple[int, int]]] = {color: [] for color in required}
        getter = getattr(image, "get_flattened_data", image.getdata)
        for index, (red, green, blue, alpha) in enumerate(getter()):
            if alpha == 0:
                normalized.append((0, 0, 0, 0))
                continue
            target = min(required, key=lambda color: sum((value - color[index]) ** 2 for index, value in enumerate((red, green, blue))))
            normalized.append((*target, alpha))
            candidates[target].append((alpha, index))
        for target in required:
            if not any(normalized[index][3] >= 128 for _alpha, index in candidates[target]):
                if not candidates[target]:
                    raise RuntimeError(f"{relative} did not rasterize required color {target}")
                _alpha, index = max(candidates[target])
                normalized[index] = (*target, 255)
        image.putdata(normalized)
        image.save(path, optimize=False, compress_level=9)


def resample_small_icons_from_aligned_master(core_geometry: dict, core_raw: dict[str, np.ndarray]) -> None:
    with Image.open(PROOF / "core-render.png") as source:
        aligned = source.convert("RGBA")
    source_bbox = (
        core_geometry["minimum_x"],
        core_geometry["minimum_y"],
        core_geometry["maximum_x"] + 1,
        core_geometry["maximum_y"] + 1,
    )
    cropped = aligned.crop(source_bbox)
    white = locked_rgb("white")
    yellow = locked_rgb("signal_yellow")
    pixels = []
    getter = getattr(cropped, "get_flattened_data", cropped.getdata)
    for red, green, blue, alpha in getter():
        if alpha and max(abs(red - white[0]), abs(green - white[1]), abs(blue - white[2])) <= 24:
            pixels.append((*yellow, alpha))
        else:
            pixels.append((red, green, blue, alpha))
    cropped.putdata(pixels)

    white_mask = core_raw["white"].astype(np.uint8)
    count, _labels, stats, _centroids = cv2.connectedComponentsWithStats(white_mask, 8)
    clear_space = max(int(stats[index, cv2.CC_STAT_WIDTH]) for index in range(1, count) if stats[index, cv2.CC_STAT_AREA] > 2)
    virtual_width = cropped.width + 2 * clear_space
    virtual_height = cropped.height + 2 * clear_space
    for relative in ("assets/brand/icons/favicon-16.png", "assets/brand/icons/favicon-32.png"):
        size = CONTRACT["required_png"][relative][0]
        scale = min(size / virtual_width, size / virtual_height)
        resized_size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
        resized = cropped.resize(resized_size, Image.Resampling.LANCZOS)
        output = Image.new("RGBA", (size, size))
        output.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
        output.save(ROOT / relative, optimize=False, compress_level=9)


def validate_source() -> Image.Image:
    if file_sha256(SOURCE) != CONTRACT["source_sha256"]:
        raise RuntimeError("approved source SHA-256 mismatch")
    image = Image.open(SOURCE).convert("RGB")
    if list(image.size) != CONTRACT["source_size"]:
        raise RuntimeError("approved source dimensions mismatch")
    return image


def build() -> None:
    image = validate_source()
    core_box = tuple(CONTRACT["core_crop"])
    wordmark_box = tuple(CONTRACT["wordmark_crop"])
    core_crop = image.crop(core_box)
    wordmark_crop = image.crop(wordmark_box)
    core, core_geometry, core_raw = trace_geometry("core", core_crop, (1000, 1000))
    wordmark, wordmark_geometry, wordmark_raw = trace_geometry("wordmark", wordmark_crop, (4000, 700))
    core_digest = geometry_hash(core)
    wordmark_digest = geometry_hash(wordmark)

    icon_view_box = expanded_icon_view_box(core_geometry, core_raw)
    safe_view_box = maskable_view_box(core_geometry, core_raw)
    write_asset_svgs(core, wordmark, core_digest, wordmark_digest, icon_view_box)
    write_reference(PROOF / "core-reference.png", core_raw, ("mars_red", "cyber_cyan", "white"))
    write_reference(PROOF / "wordmark-reference.png", wordmark_raw, ("mars_red", "cyber_cyan"))
    write_text(
        "assets/brand/proof/core-proof-source.svg",
        proof_svg("core", core, core_geometry, core_crop.size, {"core": core_digest}),
    )
    write_text(
        "assets/brand/proof/wordmark-proof-source.svg",
        proof_svg("wordmark", wordmark, wordmark_geometry, wordmark_crop.size, {"wordmark": wordmark_digest}),
    )
    write_render_sources(core, core_digest, icon_view_box, safe_view_box)
    output_manifest(core_digest, wordmark_digest)

    subprocess.run(["node", "scripts/render-brand-proofs.cjs"], cwd=ROOT, check=True)
    resample_small_icons_from_aligned_master(core_geometry, core_raw)
    normalize_transparent_icons()
    make_difference(PROOF / "core-reference.png", PROOF / "core-render.png", PROOF / "core-difference.png")
    make_difference(PROOF / "wordmark-reference.png", PROOF / "wordmark-render.png", PROOF / "wordmark-difference.png")
    make_contact_sheet()
    make_safe_zone_proof()


if __name__ == "__main__":
    build()
