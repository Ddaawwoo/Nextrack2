import re
import unittest
from pathlib import Path


INDEX = Path(__file__).resolve().parents[1] / "index.html"


def function_body(source: str, name: str) -> str:
    marker = f"function {name}("
    start = source.index(marker)
    brace = source.index("{", start)
    depth = 0
    for index in range(brace, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[brace + 1:index]
    raise AssertionError(f"Function {name} is not closed")


class MobileImportRegressionTest(unittest.TestCase):
    def test_track_is_saved_before_metadata_or_audio_analysis(self):
        source = INDEX.read_text(encoding="utf-8")
        body = function_body(source, "addTrackFromFile")

        save_position = body.index("saveTrackToDB(")
        analysis_position = body.index("analyzeAudioFile(")
        metadata_match = re.search(r"jsmediatags\.read\(", body)

        self.assertLess(
            save_position,
            analysis_position,
            "The selected file must be persisted before expensive audio analysis starts",
        )
        if metadata_match is None:
            self.fail("The importer should still read ID3 metadata")
        self.assertLess(
            save_position,
            metadata_match.start(),
            "The selected file must be persisted even when Android's metadata reader stalls",
        )
        self.assertIn(
            "setTimeout",
            body,
            "Initial analysis must be deferred so IndexedDB can commit and the UI can paint",
        )


if __name__ == "__main__":
    unittest.main()
