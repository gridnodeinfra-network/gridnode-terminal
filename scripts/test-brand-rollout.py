#!/usr/bin/env python3
"""RED/green contract for the shipped GRID//NODE v2 identity rollout."""

from __future__ import annotations

import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXPECTED_ICONS = [
    {
        "src": "/assets/brand/icons/favicon.svg",
        "sizes": "any",
        "type": "image/svg+xml",
        "purpose": "any",
    },
    {
        "src": "/assets/brand/icons/pwa-192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any",
    },
    {
        "src": "/assets/brand/icons/pwa-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any",
    },
    {
        "src": "/assets/brand/icons/pwa-maskable-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "maskable",
    },
]
EXPECTED_SW_BRAND_PATHS = {
    "/assets/brand/icons/favicon.svg",
    "/assets/brand/icons/favicon-16.png",
    "/assets/brand/icons/favicon-32.png",
    "/assets/brand/icons/apple-touch-icon.png",
    "/assets/brand/icons/pwa-192.png",
    "/assets/brand/icons/pwa-512.png",
    "/assets/brand/icons/pwa-maskable-512.png",
    "/assets/brand/ui/header-lockup.svg",
    "/assets/brand/ui/boot-mark.svg",
    "/assets/brand/ui/scanner-badge.svg",
    "/assets/brand/ui/update-badge.svg",
    "/assets/brand/ui/watermark.svg",
}
EXPECTED_SCANNER_PATHS = {
    "/assets/scanner/core/core-cinematic.webp",
    "/assets/scanner/legs/legs-cinematic.webp",
    "/assets/scanner/arms/arms-cinematic.webp",
}
OLD_IDENTITY_REFS = {
    "/assets/gridnode-icon.svg",
    "/assets/gridnode-icon-192.png",
    "/assets/gridnode-icon-512.png",
    "/assets/gridnode-icon-maskable-192.png",
    "/assets/gridnode-icon-maskable-512.png",
    "/assets/gridnode-favicon-v6.svg",
    "/assets/gridnode-insignia-v6.png",
    "/assets/apple-touch-icon.png",
    "/assets/splash-1290x2796.png",
}
BRAND_TOKENS = {
    "mars-red": "#EA0917",
    "cyber-cyan": "#06BBE3",
    "signal-yellow": "#FCEE0A",
    "black-mars": "#050708",
    "deep-navy": "#0A0F14",
    "steel-gray": "#8A949E",
}


class VisibleCopyParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden_depth = 0
        self.copy: list[str] = []
        self.images: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value or "" for key, value in attrs}
        if tag in {"script", "style", "template"}:
            self.hidden_depth += 1
        if self.hidden_depth:
            return
        if tag == "img":
            self.images.append(attributes)
        for key in ("alt", "aria-label", "title"):
            if attributes.get(key):
                self.copy.append(attributes[key])
        if tag == "meta" and attributes.get("content"):
            self.copy.append(attributes["content"])

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "template"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth and data.strip():
            self.copy.append(data.strip())


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8", errors="strict")


def read_native_css() -> str:
    # Phase 2 refactor: gridnode-native.css is split into css/native/ (pinned order).
    order = json.loads((ROOT / "css/native/order.json").read_text(encoding="utf-8"))
    return "".join((ROOT / "css/native" / name).read_text(encoding="utf-8") for name in order)


def string_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for child in value for item in string_values(child)]
    if isinstance(value, dict):
        return [item for child in value.values() for item in string_values(child)]
    return []


def quoted_absolute_paths(text: str) -> set[str]:
    return set(re.findall(r"['\"](/[^'\"]+)['\"]", text))


class BrandRolloutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = read("index.html")
        cls.manifest = json.loads(read("manifest.json"))
        cls.sw = read("sw.js")
        cls.native_css = read_native_css()
        cls.day_css = read("css/daylight-nexus-pilot.css")
        cls.app_js = read("js/gridnode-app.js")
        cls.bundle_js = read("js/gridnode-bundle.js")
        cls.parser = VisibleCopyParser()
        cls.parser.feed(cls.html)

    def test_canonical_user_facing_name(self) -> None:
        copy = list(self.parser.copy)
        for path in ("i18n/en.json", "i18n/es-419.json"):
            copy.extend(string_values(json.loads(read(path))))
        rendered = "\n".join(copy)
        for invalid in ("GRIDNODE", "GRID // NODE", "GRID / NODE", "Grid Node"):
            self.assertNotIn(invalid, rendered, f"noncanonical rendered identity: {invalid}")
        self.assertIn("GRID//NODE", rendered)

    def test_shipped_identity_and_docs_have_no_vektor_residue(self) -> None:
        self.assertFalse((ROOT / "REPORT_TO_VEKTOR.md").exists(), "obsolete report filename still exists")
        required = ROOT / "GRIDNODE_IMPLEMENTATION_REPORT.md"
        self.assertTrue(required.is_file(), "corrected implementation report is missing")
        scope = [
            "index.html",
            "manifest.json",
            "sw.js",
            "css/native/00-base.css",
            "css/native/01-readability-floor.css",
            "css/native/02-first-five-minutes.css",
            "css/native/03-premium-system.css",
            "css/native/04-first-contact.css",
            "css/daylight-nexus-pilot.css",
            "js/gridnode-app.js",
            "js/gridnode-bundle.js",
            "AGENTS.md",
            "GRIDNODE_IMPLEMENTATION_REPORT.md",
            "i18n/en.json",
            "i18n/es-419.json",
        ]
        for path in scope:
            with self.subTest(path=path):
                self.assertNotRegex(read(path), re.compile(r"vektor", re.I))

    def test_manifest_uses_only_locked_brand_icons(self) -> None:
        self.assertEqual(self.manifest.get("name"), "GRID//NODE")
        self.assertEqual(self.manifest.get("short_name"), "GRID//NODE")
        self.assertEqual(self.manifest.get("background_color"), "#050708")
        self.assertEqual(self.manifest.get("theme_color"), "#050708")
        self.assertEqual(self.manifest.get("icons"), EXPECTED_ICONS)
        for shortcut in self.manifest.get("shortcuts", []):
            self.assertEqual(shortcut.get("icons"), [{
                "src": "/assets/brand/icons/pwa-192.png",
                "sizes": "192x192",
                "type": "image/png",
            }])

    def test_head_and_runtime_use_new_asset_authority(self) -> None:
        self.assertRegex(self.html, re.compile(r'<link\s+rel="icon"\s+type="image/svg\+xml"\s+href="/assets/brand/icons/favicon\.svg"'))
        self.assertRegex(self.html, re.compile(r'<link\s+rel="icon"\s+type="image/png"\s+sizes="32x32"\s+href="/assets/brand/icons/favicon-32\.png"'))
        self.assertRegex(self.html, re.compile(r'<link\s+rel="apple-touch-icon"\s+sizes="180x180"\s+href="/assets/brand/icons/apple-touch-icon\.png"'))
        runtime = "\n".join((self.html, self.sw, self.native_css, self.day_css, self.app_js, self.bundle_js, json.dumps(self.manifest)))
        for value in OLD_IDENTITY_REFS:
            self.assertNotIn(value, runtime, f"obsolete identity reference: {value}")
        for value in EXPECTED_SW_BRAND_PATHS:
            self.assertIn(value, runtime, f"brand derivative is not wired: {value}")

    def test_visible_identity_uses_real_accessible_assets(self) -> None:
        self.assertNotRegex(self.html, re.compile(r"<svg[^>]+class=[\"'][^\"']*gn-b2b-(?:lockup|symbol|wordmark)", re.I))
        expected_ui = {
            "/assets/brand/ui/header-lockup.svg",
            "/assets/brand/ui/boot-mark.svg",
            "/assets/brand/ui/scanner-badge.svg",
            "/assets/brand/ui/update-badge.svg",
            "/assets/brand/ui/watermark.svg",
        }
        images = {image.get("src", ""): image for image in self.parser.images if image.get("src", "").startswith("/assets/brand/")}
        for value in expected_ui - {"/assets/brand/ui/update-badge.svg", "/assets/brand/ui/watermark.svg"}:
            self.assertIn(value, images, f"visible UI brand asset missing: {value}")
            self.assertIn("GRID//NODE", images[value].get("alt", ""), f"accessible name missing for {value}")
        self.assertIn("/assets/brand/ui/update-badge.svg", runtime_sources(self.app_js + self.bundle_js + self.html))
        self.assertIn("/assets/brand/ui/watermark.svg", runtime_sources(self.native_css + self.day_css + self.html))

    def test_locked_token_authority_is_exact_and_day_ops_is_flat(self) -> None:
        styles = "\n".join((self.html, self.native_css, self.day_css))
        for token, value in BRAND_TOKENS.items():
            matches = re.findall(rf"--gn-brand-{re.escape(token)}\s*:\s*{re.escape(value)}\b", styles, flags=re.I)
            self.assertEqual(len(matches), 1, f"token --gn-brand-{token} must be defined exactly once")
        light_rule = re.search(r"html\[data-theme=[\"']light[\"']\][^\{]*\.gn-brand-asset[^\{]*\{([^}]+)\}", styles, flags=re.I | re.S)
        self.assertIsNotNone(light_rule, "DAY OPS flat brand rule missing")
        declarations = light_rule.group(1).replace(" ", "").lower()
        self.assertIn("filter:none!important", declarations)
        self.assertIn("box-shadow:none!important", declarations)
        self.assertIn("text-shadow:none!important", declarations)

    def test_service_worker_precaches_brand_and_cinematic_scanner(self) -> None:
        paths = quoted_absolute_paths(self.sw)
        self.assertTrue(EXPECTED_SW_BRAND_PATHS <= paths, EXPECTED_SW_BRAND_PATHS - paths)
        self.assertTrue(EXPECTED_SCANNER_PATHS <= paths, EXPECTED_SCANNER_PATHS - paths)
        release_match = re.search(r"const RELEASE = '([^']+)';", self.sw)
        cache_match = re.search(r"const CACHE_NAME = 'gridnode-shell-([^']+)';", self.sw)
        self.assertIsNotNone(release_match)
        self.assertIsNotNone(cache_match)
        self.assertEqual(release_match.group(1), cache_match.group(1), "service-worker release/cache drift")


def runtime_sources(text: str) -> set[str]:
    return set(re.findall(r"/assets/brand/[A-Za-z0-9_./-]+", text))


if __name__ == "__main__":
    unittest.main(verbosity=2)
