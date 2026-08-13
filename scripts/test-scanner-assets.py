from __future__ import annotations

import struct
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODES = ("core", "legs", "arms")
EXPECTED_DIMENSIONS = (1024, 1024)
MINIMUM_CINEMATIC_SIZE = 60_000


def read_webp_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("missing RIFF/WEBP header")

    declared_size = struct.unpack_from("<I", data, 4)[0] + 8
    if declared_size != len(data):
        raise ValueError("RIFF size does not match file size")

    offset = 12
    while offset + 8 <= len(data):
        chunk_type = data[offset : offset + 4]
        chunk_size = struct.unpack_from("<I", data, offset + 4)[0]
        payload_start = offset + 8
        payload_end = payload_start + chunk_size
        if payload_end > len(data):
            raise ValueError("truncated WebP chunk")

        payload = data[payload_start:payload_end]
        if chunk_type == b"VP8X":
            if len(payload) < 10:
                raise ValueError("truncated VP8X header")
            width = 1 + int.from_bytes(payload[4:7], "little")
            height = 1 + int.from_bytes(payload[7:10], "little")
            return width, height

        if chunk_type == b"VP8L":
            if len(payload) < 5 or payload[0] != 0x2F:
                raise ValueError("invalid VP8L header")
            bits = int.from_bytes(payload[1:5], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
            return width, height

        if chunk_type == b"VP8 ":
            if len(payload) < 10 or payload[3:6] != b"\x9d\x01\x2a":
                raise ValueError("invalid VP8 frame header")
            width, height = struct.unpack_from("<HH", payload, 6)
            return width & 0x3FFF, height & 0x3FFF

        offset = payload_end + (chunk_size % 2)

    raise ValueError("missing WebP image payload")


class ScannerAssetContractTest(unittest.TestCase):
    def test_required_originals_exist(self) -> None:
        for mode in MODES:
            with self.subTest(mode=mode):
                original = ROOT / "assets" / "scanner" / mode / f"{mode}.webp"
                self.assertTrue(original.is_file(), f"missing original: {original}")

    def test_cinematic_assets_meet_contract(self) -> None:
        for mode in MODES:
            with self.subTest(mode=mode):
                cinematic = ROOT / "assets" / "scanner" / mode / f"{mode}-cinematic.webp"
                self.assertTrue(cinematic.is_file(), f"missing cinematic: {cinematic}")
                self.assertGreaterEqual(
                    cinematic.stat().st_size,
                    MINIMUM_CINEMATIC_SIZE,
                    f"cinematic asset is smaller than {MINIMUM_CINEMATIC_SIZE} bytes: {cinematic}",
                )
                try:
                    dimensions = read_webp_dimensions(cinematic)
                except ValueError as error:
                    self.fail(f"invalid WebP {cinematic}: {error}")
                self.assertEqual(
                    dimensions,
                    EXPECTED_DIMENSIONS,
                    f"cinematic asset must be 1024x1024: {cinematic}",
                )


if __name__ == "__main__":
    unittest.main()
