"""Local runner boundary checks: no client, network, consent or hosted access."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

RUNNER = Path(__file__).with_name("run-app-creation-agent.py")
GUIDE = "https://raw.githubusercontent.com/TinyCloudLabs/prompts/refs/heads/docs/initial-setup-split/quickstart/tinycloud.md"


class PublicEntryBoundary(unittest.TestCase):
    def command(self, directory):
        return [sys.executable, str(RUNNER), "--mode", "public-entry", "--prepare-only",
                "--directory", str(directory), "--request", "Compare my book loans this month.",
                "--guide", GUIDE, "--starting-state", "Disposable existing hosted owner; saved reader grants",
                "--guide-revision", "4a61f38803bb9852953b6544b6d7631edc8a8711"]

    def test_public_input_contains_only_request_and_exact_link(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "evidence"
            result = subprocess.run(self.command(directory), capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((directory / "request.txt").read_text(),
                             "Compare my book loans this month.\n\nUse TinyCloud: " + GUIDE + "\n")
            self.assertEqual(list((directory / "workspace").iterdir()), [])
            evidence = json.loads((directory / "evidence.json").read_text())
            self.assertEqual(evidence["outcome"], "prepared-not-run")
            self.assertIsNone(evidence["guide"]["servedRevision"])
            self.assertIsNone(evidence["measurements"]["consentCount"])
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            self.assertEqual((directory / "request.txt").stat().st_mode & 0o777, 0o600)

    def test_public_mode_rejects_synthetic_injections_before_creating_evidence(self):
        for option in ("--connection", "--state", "--continuation"):
            with self.subTest(option=option), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary) / "evidence"
                result = subprocess.run(self.command(directory) + [option, "/must-not-read"],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(directory.exists())

    def test_public_mode_rejects_nonpublic_or_credential_bearing_links(self):
        for guide in ("/tmp/entry.md", "http://localhost/entry.md", "https://user:secret@example.org/entry.md"):
            with self.subTest(guide=guide), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary) / "evidence"
                command = self.command(directory)
                command[command.index("--guide") + 1] = guide
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(directory.exists())


if __name__ == "__main__":
    unittest.main()
