import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SecurityAndPwaRegressionTest(unittest.TestCase):
    def test_dynamic_library_text_is_escaped(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("${escapeHtml(track.title)}", source)
        self.assertIn("${escapeHtml(track.artist)}", source)
        self.assertIn("${escapeHtml(pl.name)}", source)
        self.assertIn("${escapeHtml(file.name || 'Audio soubor')}", source)
        self.assertIn('value="${escapeHtml(playlist.name)}"', source)

    def test_null_energy_is_not_counted_as_zero(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("t.energyScore !== null", source)
        self.assertIn("t.energyScore !== undefined", source)

    def test_pwa_precaches_manifest_and_icons(self):
        source = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn("'./manifest.json'", source)
        self.assertIn("'./icons/icon-192x192.png'", source)
        self.assertIn("'./icons/icon-512x512.png'", source)
        self.assertIn("event.request.method !== 'GET'", source)


if __name__ == "__main__":
    unittest.main()
