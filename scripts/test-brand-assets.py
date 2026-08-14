#!/usr/bin/env python3
"""Executable lock for the approved GRID//NODE v2 brand asset pipeline."""

from __future__ import annotations

import hashlib
import json
import math
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "scripts/brand-reference-contract.json"
SOURCE = ROOT / "assets/brand/source/GRIDNODE-BRAND-SYSTEM-v2-APPROVED.png"
HEX_64 = re.compile(r"^[0-9a-f]{64}$")
NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
PATH_TOKEN = re.compile(rf"[MLZ]|{NUMBER}")
TRANSFORM_TOKEN = re.compile(r"(translate|scale|matrix)\s*\(([^)]*)\)")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_hex(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def iou(expected: list[bool], actual: list[bool]) -> float:
    intersection = sum(left and right for left, right in zip(expected, actual))
    union = sum(left or right for left, right in zip(expected, actual))
    return 1.0 if union == 0 else intersection / union


def flattened(image: Image.Image) -> list:
    getter = getattr(image, "get_flattened_data", image.getdata)
    return list(getter())


def canonical_sha256(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("ascii")).hexdigest()


def polygon_area(ring: list[tuple[float, float]]) -> float:
    return abs(
        sum(
            left[0] * right[1] - right[0] * left[1]
            for left, right in zip(ring, ring[1:] + ring[:1])
        )
    ) / 2.0


def parse_path_rings(value: str) -> list[list[tuple[float, float]]]:
    tokens = PATH_TOKEN.findall(value.replace(",", " "))
    residue = PATH_TOKEN.sub(" ", value.replace(",", " "))
    if residue.strip() or not tokens:
        raise ValueError(f"unsupported path syntax: {value!r}")
    rings: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    index = 0
    command = ""
    while index < len(tokens):
        token = tokens[index]
        if token in {"M", "L", "Z"}:
            command = token
            index += 1
            if token == "M" and current:
                rings.append(current)
                current = []
            elif token == "Z":
                if current:
                    rings.append(current)
                    current = []
                command = ""
            continue
        if command not in {"M", "L"} or index + 1 >= len(tokens):
            raise ValueError(f"path coordinate without M/L command: {value!r}")
        current.append((round(float(tokens[index]), 3), round(float(tokens[index + 1]), 3)))
        index += 2
        command = "L"
    if current:
        rings.append(current)
    if not rings or any(len(set(ring)) < 3 or polygon_area(ring) <= 0.001 for ring in rings):
        raise ValueError(f"empty or zero-area path geometry: {value!r}")
    return rings


def parse_polygon_ring(value: str) -> list[list[tuple[float, float]]]:
    numbers = [float(number) for number in re.findall(NUMBER, value)]
    residue = re.sub(NUMBER, " ", value.replace(",", " "))
    if residue.strip() or len(numbers) < 6 or len(numbers) % 2:
        raise ValueError(f"invalid polygon points: {value!r}")
    ring = [(round(numbers[index], 3), round(numbers[index + 1], 3)) for index in range(0, len(numbers), 2)]
    if len(set(ring)) < 3 or polygon_area(ring) <= 0.001:
        raise ValueError(f"empty or zero-area polygon geometry: {value!r}")
    return [ring]


def largest_component_width(mask: list[bool], size: tuple[int, int]) -> int:
    width, height = size
    remaining = {index for index, enabled in enumerate(mask) if enabled}
    widest = 0
    while remaining:
        seed = remaining.pop()
        stack = [seed]
        minimum_x = maximum_x = seed % width
        while stack:
            current = stack.pop()
            x, y = current % width, current // width
            minimum_x, maximum_x = min(minimum_x, x), max(maximum_x, x)
            for neighbor_x, neighbor_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= neighbor_x < width and 0 <= neighbor_y < height:
                    neighbor = neighbor_y * width + neighbor_x
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        stack.append(neighbor)
        widest = max(widest, maximum_x - minimum_x + 1)
    return widest


class BrandAssetContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    def path(self, value: str) -> Path:
        return ROOT / value

    def require_future_file(self, value: str) -> Path:
        path = self.path(value)
        self.assertTrue(path.is_file(), f"future brand output missing: {value}")
        return path

    def expected_source_mask(self, crop_name: str, color_name: str) -> list[bool]:
        crop = self.contract[crop_name]
        with Image.open(SOURCE) as source:
            hsv = source.convert("RGB").crop(tuple(crop)).convert("HSV")
            pixels = flattened(hsv)
        rule = self.contract["hsv_masks"][color_name]
        minimum_saturation = rule.get("min_saturation", 0)
        maximum_saturation = rule.get("max_saturation", 255)
        minimum_value = rule.get("min_value", 0)
        maximum_value = rule.get("max_value", 255)
        return [
            any(low <= hue <= high for low, high in rule["hue_ranges"])
            and minimum_saturation <= saturation <= maximum_saturation
            and minimum_value <= value <= maximum_value
            for hue, saturation, value in pixels
        ]

    def output_color_mask(self, image: Image.Image, color_name: str) -> list[bool]:
        target = parse_hex(self.contract["colors"][color_name])
        pixels = flattened(image.convert("RGBA"))
        return [
            alpha > 0 and max(abs(red - target[0]), abs(green - target[1]), abs(blue - target[2])) <= 18
            for red, green, blue, alpha in pixels
        ]

    def validate_transform(self, value: str, asset: str) -> None:
        matches = list(TRANSFORM_TOKEN.finditer(value))
        residue = TRANSFORM_TOKEN.sub(" ", value).replace(",", " ").strip()
        self.assertTrue(matches and not residue, f"unsupported transform in {asset}: {value!r}")
        for match in matches:
            name = match.group(1)
            numbers = [float(number) for number in re.findall(NUMBER, match.group(2))]
            if name == "translate":
                self.assertIn(len(numbers), (1, 2), f"invalid translate in {asset}")
            elif name == "scale":
                self.assertIn(len(numbers), (1, 2), f"invalid scale in {asset}")
                self.assertGreater(numbers[0], 0, f"non-positive scale in {asset}")
                if len(numbers) == 2:
                    self.assertAlmostEqual(numbers[0], numbers[1], places=9, msg=f"non-uniform scale in {asset}")
            else:
                self.assertEqual(len(numbers), 6, f"invalid matrix in {asset}")
                a, b, c, d, _e, _f = numbers
                self.assertAlmostEqual(b, 0.0, places=9, msg=f"rotated/skewed matrix in {asset}")
                self.assertAlmostEqual(c, 0.0, places=9, msg=f"rotated/skewed matrix in {asset}")
                self.assertAlmostEqual(a, d, places=9, msg=f"non-uniform matrix in {asset}")
                self.assertGreater(a, 0, f"non-positive matrix scale in {asset}")

    def geometry_hashes(self, root: ET.Element, asset: str, expected: dict) -> dict[str, str]:
        for element in root.iter():
            if "transform" in element.attrib:
                self.validate_transform(element.attrib["transform"], asset)

        payloads: dict[str, list[dict]] = {"core": [], "wordmark": []}
        for element in root.iter():
            tag = local_name(element.tag)
            if tag not in {"path", "polygon"}:
                continue
            kind = element.attrib.get("data-gn-geometry")
            if not kind:
                self.assertEqual(element.attrib.get("data-gn-presentation"), "true", f"unclassified geometry in {asset}")
                continue
            self.assertIn(kind, payloads, f"unknown geometry kind {kind!r} in {asset}")
            component = element.attrib.get("data-gn-component", "").strip()
            self.assertTrue(component, f"geometry lacks stable component id in {asset}")
            try:
                rings = parse_path_rings(element.attrib.get("d", "")) if tag == "path" else parse_polygon_ring(element.attrib.get("points", ""))
            except ValueError as error:
                self.fail(f"{asset}: {error}")
            payloads[kind].append({"component": component, "tag": tag, "rings": rings})

        hashes: dict[str, str] = {}
        for kind in ("core", "wordmark"):
            used = expected[f"uses_{kind}"]
            payload = sorted(payloads[kind], key=lambda item: (item["component"], item["tag"], item["rings"]))
            if used:
                self.assertTrue(payload, f"{asset} declares {kind} use but has no {kind} geometry")
                self.assertEqual(len({item["component"] for item in payload}), len(payload), f"duplicate {kind} component ids in {asset}")
                hashes[kind] = canonical_sha256(payload)
            else:
                self.assertFalse(payload, f"{asset} contains undeclared {kind} geometry")

        master_hash = canonical_sha256(hashes)
        self.assertEqual(root.attrib.get("data-gn-master-hash"), master_hash, f"self-declared master hash in {asset}")
        for kind, digest in hashes.items():
            self.assertEqual(root.attrib.get(f"data-gn-{kind}-geometry-sha256"), digest, f"wrong {kind} hash in {asset}")
        return {**hashes, "master": master_hash}

    def test_source_board_is_byte_exact(self) -> None:
        self.assertTrue(SOURCE.is_file(), "immutable approved brand board is missing")
        self.assertEqual(sha256(SOURCE), self.contract["source_sha256"])
        with Image.open(SOURCE) as image:
            self.assertEqual(image.size, tuple(self.contract["source_size"]))
            image.verify()

    def test_required_assets_exist_and_decode(self) -> None:
        for value in self.contract["required_svg"]:
            with self.subTest(svg=value):
                path = self.path(value)
                if not path.is_file():
                    self.fail(f"future brand output missing: {value}")
                    continue
                try:
                    root = ET.parse(path).getroot()
                except ET.ParseError as error:
                    self.fail(f"invalid SVG {value}: {error}")
                    continue
                self.assertEqual(local_name(root.tag), "svg")

        for value, expected_size in self.contract["required_png"].items():
            with self.subTest(png=value):
                path = self.path(value)
                if not path.is_file():
                    self.fail(f"future brand output missing: {value}")
                    continue
                with Image.open(path) as image:
                    self.assertEqual(image.size, tuple(expected_size))
                    image.verify()

    def test_vectors_are_real_flat_approved_geometry(self) -> None:
        allowed = {paint.upper() if paint.startswith("#") else paint for paint in self.contract["allowed_paints"]}
        forbidden = {"image", "text", "foreignObject"}
        flat_forbidden = {"filter", "linearGradient", "radialGradient", "pattern"}
        filter_prohibited = set(self.contract["filter_prohibited_svg"])

        for value in self.contract["required_svg"]:
            with self.subTest(svg=value):
                path = self.path(value)
                if not path.is_file():
                    self.fail(f"future brand output missing: {value}")
                    continue
                root = ET.parse(path).getroot()
                tags = {local_name(element.tag) for element in root.iter()}
                self.assertFalse(tags & forbidden, f"embedded/text asset in {value}: {tags & forbidden}")
                self.assertNotIn("style", tags, f"CSS style block can hide unapproved paints in {value}")
                self.assertTrue(tags & {"path", "polygon"}, f"no traced geometry in {value}")
                if value in filter_prohibited:
                    self.assertFalse(tags & flat_forbidden, f"non-flat construct in {value}: {tags & flat_forbidden}")
                self.assertEqual(root.attrib.get("data-gn-source-sha256"), self.contract["source_sha256"])
                hashes = self.geometry_hashes(root, value, self.contract["svg_output_geometry"][value])
                self.assertRegex(hashes["master"], HEX_64)

                paints: list[str] = []
                for element in root.iter():
                    paints.extend(element.attrib[key].strip() for key in ("fill", "stroke") if key in element.attrib)
                    for declaration in element.attrib.get("style", "").split(";"):
                        key, separator, paint = declaration.partition(":")
                        if separator and key.strip() in {"fill", "stroke"}:
                            paints.append(paint.strip())
                for paint in paints:
                    normalized = paint.upper() if paint.startswith("#") else paint
                    self.assertIn(normalized, allowed, f"unapproved paint {paint!r} in {value}")
                    self.assertNotIn("url(", paint.lower(), f"external/CSS paint in {value}")

    def test_manifest_proves_single_master_derivation(self) -> None:
        value = self.contract["manifest_path"]
        path = self.require_future_file(value)
        manifest = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(manifest.get("source_sha256"), self.contract["source_sha256"])
        self.assertEqual(manifest.get("canonical_name"), self.contract["canonical_name"])
        outputs = manifest.get("outputs")
        self.assertIsInstance(outputs, list, "manifest outputs must be a list")
        represented = {item.get("path") for item in outputs}
        self.assertEqual(set(self.contract["manifest_required_output_paths"]), represented)

        svg_hashes: dict[str, dict[str, str]] = {}
        for value, expected in self.contract["svg_output_geometry"].items():
            svg_path = self.require_future_file(value)
            svg_hashes[value] = self.geometry_hashes(ET.parse(svg_path).getroot(), value, expected)
        for item in outputs:
            value = item.get("path")
            if value not in svg_hashes:
                continue
            expected = self.contract["svg_output_geometry"][value]
            self.assertEqual(item.get("uses_core"), expected["uses_core"], f"manifest core-use mismatch for {value}")
            self.assertEqual(item.get("uses_wordmark"), expected["uses_wordmark"], f"manifest wordmark-use mismatch for {value}")
            self.assertEqual(item.get("master_geometry_sha256"), svg_hashes[value]["master"], f"manifest master hash not recomputed for {value}")
            for kind in ("core", "wordmark"):
                if expected[f"uses_{kind}"]:
                    self.assertEqual(item.get(f"{kind}_geometry_sha256"), svg_hashes[value][kind], f"manifest {kind} hash not recomputed for {value}")

        core_hashes = {hashes["core"] for hashes in svg_hashes.values() if "core" in hashes}
        wordmark_hashes = {hashes["wordmark"] for hashes in svg_hashes.values() if "wordmark" in hashes}
        self.assertEqual(len(core_hashes), 1, "all core derivatives must share one geometry hash")
        self.assertEqual(len(wordmark_hashes), 1, "all wordmark derivatives must share one geometry hash")
        self.assertRegex(next(iter(core_hashes)), HEX_64)
        self.assertRegex(next(iter(wordmark_hashes)), HEX_64)

    def test_png_alpha_and_maskable_safe_zone_contracts(self) -> None:
        for value in self.contract["transparent_png"]:
            with self.subTest(transparent=value):
                path = self.path(value)
                if not path.is_file():
                    self.fail(f"future brand output missing: {value}")
                    continue
                with Image.open(path) as source:
                    image = source.convert("RGBA")
                alpha = image.getchannel("A")
                self.assertLess(alpha.getextrema()[0], 255, f"{value} has no transparency")
                corners = ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))
                self.assertTrue(all(alpha.getpixel(point) == 0 for point in corners), f"{value} lacks transparent clear space")
                approved = [parse_hex(color) for color in self.contract["colors"].values()]
                for red, green, blue, opacity in flattened(image):
                    if opacity:
                        self.assertTrue(any(max(abs(red - target[0]), abs(green - target[1]), abs(blue - target[2])) <= 24 for target in approved), f"off-palette PNG pixel in {value}")
                for color_name in self.contract["png_color_requirements"][value]:
                    self.assertGreater(sum(self.output_color_mask(image, color_name)), 0, f"{value} lacks {color_name}")

        maskable = self.contract["maskable"]
        path = self.require_future_file(maskable["path"])
        with Image.open(path) as source:
            image = source.convert("RGBA")
        background = parse_hex(maskable["background"])
        self.assertEqual(image.getchannel("A").getextrema(), (255, 255), "maskable icon must be fully opaque")
        corners = ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))
        self.assertTrue(all(image.getpixel(point)[:3] == background for point in corners), "maskable background must be Black Mars")
        important = [parse_hex(self.contract["colors"][name]) for name in maskable["important_colors"]]
        center_x = image.width * maskable["safe_circle"]["center_fraction"][0]
        center_y = image.height * maskable["safe_circle"]["center_fraction"][1]
        radius = min(image.size) * maskable["safe_circle"]["radius_fraction"]
        important_pixels = 0
        outside = []
        for y in range(image.height):
            for x in range(image.width):
                rgb = image.getpixel((x, y))[:3]
                if max(abs(rgb[channel] - background[channel]) for channel in range(3)) <= 8:
                    continue
                important_pixels += 1
                def blended_from_approved(target: tuple[int, int, int]) -> bool:
                    vector = [target[channel] - background[channel] for channel in range(3)]
                    denominator = sum(component * component for component in vector)
                    blend = sum((rgb[channel] - background[channel]) * vector[channel] for channel in range(3)) / denominator
                    blend = min(1.0, max(0.0, blend))
                    predicted = [background[channel] + blend * vector[channel] for channel in range(3)]
                    return max(abs(rgb[channel] - predicted[channel]) for channel in range(3)) <= 14
                self.assertTrue(any(blended_from_approved(target) for target in important), f"off-palette maskable pixel at {(x, y)}: {rgb}")
                if math.hypot((x + 0.5) - center_x, (y + 0.5) - center_y) > radius:
                    outside.append((x, y))
        self.assertGreater(important_pixels, 0, "maskable icon has no approved identity pixels")
        self.assertFalse(outside, f"maskable important pixels outside 80% safe circle; first={outside[:1]}")
        for color_name in self.contract["png_color_requirements"][maskable["path"]]:
            self.assertGreater(sum(self.output_color_mask(image, color_name)), 0, f"maskable icon lacks {color_name}")

    def test_large_fidelity_proofs_meet_per_color_iou_floors(self) -> None:
        for proof_name in ("core", "wordmark"):
            proof = self.contract["proof"][proof_name]
            with self.subTest(proof=proof_name):
                paths = {kind: self.path(proof[kind]) for kind in ("reference", "render", "difference")}
                missing = [str(path.relative_to(ROOT)) for path in paths.values() if not path.is_file()]
                if missing:
                    self.fail(f"future brand proof missing: {', '.join(missing)}")
                    continue
                images = {}
                for kind, path in paths.items():
                    with Image.open(path) as source:
                        self.assertEqual(source.size, tuple(proof["size"]), f"wrong {proof_name} {kind} size")
                        images[kind] = source.convert("RGBA")
                for color_name in proof["color_masks"]:
                    expected = self.expected_source_mask(proof["source_crop"], color_name)
                    reference_score = iou(expected, self.output_color_mask(images["reference"], color_name))
                    render_score = iou(expected, self.output_color_mask(images["render"], color_name))
                    self.assertGreaterEqual(reference_score, 0.995, f"{proof_name}/{color_name} reference mask is not source-derived")
                    self.assertGreaterEqual(render_score, proof["iou_floor"], f"{proof_name}/{color_name} IoU {render_score:.4f}")

    def test_small_size_and_safe_zone_proofs(self) -> None:
        proof = self.contract["proof"]["small"]
        for key, size_key in (("contact_sheet", "contact_sheet_size"), ("maskable_safe_zone", "maskable_safe_zone_size")):
            with self.subTest(proof=key):
                path = self.path(proof[key])
                if not path.is_file():
                    self.fail(f"future brand proof missing: {proof[key]}")
                    continue
                with Image.open(path) as image:
                    self.assertEqual(image.size, tuple(proof[size_key]))
                    image.verify()

        crop_name = proof["source_crop"]
        source_union = [False] * (self.contract[crop_name][2] - self.contract[crop_name][0]) * (self.contract[crop_name][3] - self.contract[crop_name][1])
        for color_name in ("mars_red", "cyber_cyan", "white"):
            source_union = [left or right for left, right in zip(source_union, self.expected_source_mask(crop_name, color_name))]
        source_size = (self.contract[crop_name][2] - self.contract[crop_name][0], self.contract[crop_name][3] - self.contract[crop_name][1])
        source_mask = Image.new("L", source_size)
        source_mask.putdata([255 if pixel else 0 for pixel in source_union])
        source_bbox = source_mask.getbbox()
        self.assertIsNotNone(source_bbox, "source silhouette mask is empty")
        clear_space_rule = proof["clear_space"]
        component_mask = self.expected_source_mask(crop_name, clear_space_rule["source_component_mask"])
        clear_space = largest_component_width(component_mask, source_size) * clear_space_rule["multiplier"]
        self.assertGreater(clear_space, 0, "clear-space source component is empty")
        cropped_source = source_mask.crop(source_bbox)

        for value, floor in proof["favicon_iou"].items():
            with self.subTest(favicon=value):
                path = self.path(value)
                if not path.is_file():
                    self.fail(f"future brand output missing: {value}")
                    continue
                with Image.open(path) as source:
                    icon = source.convert("RGBA")
                virtual_width = cropped_source.width + 2 * clear_space
                virtual_height = cropped_source.height + 2 * clear_space
                scale = min(icon.width / virtual_width, icon.height / virtual_height)
                expected_size = (max(1, round(cropped_source.width * scale)), max(1, round(cropped_source.height * scale)))
                resized = cropped_source.resize(expected_size, Image.Resampling.NEAREST)
                expected_image = Image.new("L", icon.size)
                expected_image.paste(resized, ((icon.width - resized.width) // 2, (icon.height - resized.height) // 2))
                expected = [pixel > 0 for pixel in flattened(expected_image)]
                actual = [False] * (icon.width * icon.height)
                for color_name in ("mars_red", "cyber_cyan", "signal_yellow", "white"):
                    actual = [left or right for left, right in zip(actual, self.output_color_mask(icon, color_name))]
                score = iou(expected, actual)
                self.assertGreaterEqual(score, floor, f"{value} silhouette IoU {score:.4f}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
