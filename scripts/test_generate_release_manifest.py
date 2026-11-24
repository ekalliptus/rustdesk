import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT_PATH = Path(__file__).resolve().parent / "generate-release-manifest.py"
SPEC = importlib.util.spec_from_file_location("generate_release_manifest", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class GenerateReleaseManifestTests(unittest.TestCase):
    def test_generates_deterministic_manifest_and_checksums(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp) / "dist"
            dist.mkdir()
            (dist / ".hidden-file").write_bytes(b"ignore")
            (dist / "latest.json").write_text("{}", encoding="utf-8")
            (dist / "SHA256SUMS.txt").write_text("", encoding="utf-8")
            (dist / "notes.txt").write_text("ignore", encoding="utf-8")

            files = {
                "el-desk-1.5.3-arm64-v8a.apk": b"apk-payload",
                "el-desk-1.5.3-x86_64.exe": b"win-exe-payload",
                "el-desk-1.5.3-x86_64.deb": b"deb-payload",
                "el-desk-1.5.3-x86_64.AppImage": b"appimage-payload",
                "el-desk-1.5.3-arm64.dmg": b"dmg-arm64-payload",
            }
            for name, payload in files.items():
                (dist / name).write_bytes(payload)

            changelog = Path(tmp) / "CHANGELOG.txt"
            changelog.write_text("## 1.5.3\n- Hardened private endpoints.\n", encoding="utf-8")

            rc = MOD.main(
                [
                    "--dist-dir",
                    str(dist),
                    "--version",
                    "v1.5.3",
                    "--published-at",
                    "2026-11-23T08:00:00Z",
                    "--changelog-file",
                    str(changelog),
                ]
            )
            self.assertEqual(rc, 0)

            manifest = json.loads((dist / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["version"], "1.5.3")
            self.assertEqual(manifest["release_id"], "v1.5.3")
            self.assertEqual(manifest["published_at"], "2026-11-23T08:00:00Z")
            self.assertEqual(manifest["url"], "https://desk.ekalliptus.com/#downloads")
            self.assertIn("Hardened private endpoints.", manifest["changelog"])

            artifacts = manifest["artifacts"]
            self.assertEqual(
                [(a["platform"], a["arch"], a["format"]) for a in artifacts],
                [
                    ("windows", "x86_64", "exe"),
                    ("linux", "x86_64", "AppImage"),
                    ("linux", "x86_64", "deb"),
                    ("macos", "arm64", "dmg"),
                    ("android", "arm64-v8a", "apk"),
                ],
            )
            for item in artifacts:
                raw = files[item["file_name"]]
                self.assertEqual(item["size"], len(raw))
                self.assertEqual(item["sha256"], hashlib.sha256(raw).hexdigest())
                self.assertEqual(
                    item["url"],
                    f"https://dl.desk.ekalliptus.com/releases/v1.5.3/{item['file_name']}",
                )

            sums_lines = (dist / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(sums_lines), len(artifacts))
            self.assertEqual(
                sums_lines[0],
                f"{hashlib.sha256(files['el-desk-1.5.3-x86_64.exe']).hexdigest()}  el-desk-1.5.3-x86_64.exe",
            )

    def test_rejects_empty_dist_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp) / "empty"
            dist.mkdir()
            (dist / "README.md").write_text("not an installer", encoding="utf-8")
            rc = MOD.main(["--dist-dir", str(dist), "--version", "1.5.3"])
            self.assertEqual(rc, 1)

    def test_rejects_invalid_semver_and_non_https_urls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp) / "dist"
            dist.mkdir()
            (dist / "el-desk-1.5.3-x86_64.exe").write_bytes(b"exe")

            self.assertEqual(MOD.main(["--dist-dir", str(dist), "--version", "1.5.3-beta"]), 1)
            self.assertEqual(MOD.main(["--dist-dir", str(dist), "--version", "0.0.0"]), 1)
            self.assertEqual(
                MOD.main(
                    [
                        "--dist-dir",
                        str(dist),
                        "--version",
                        "1.5.3",
                        "--r2-base-url",
                        "http://dl.desk.ekalliptus.com",
                    ]
                ),
                1,
            )
            self.assertEqual(
                MOD.main(
                    [
                        "--dist-dir",
                        str(dist),
                        "--version",
                        "1.5.3",
                        "--web-url",
                        "https://desk.ekalliptus.com:8443/#downloads",
                    ]
                ),
                1,
            )


if __name__ == "__main__":
    unittest.main()
