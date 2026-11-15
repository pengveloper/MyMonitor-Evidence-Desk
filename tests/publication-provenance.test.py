import hashlib,json,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
COMMIT="1"*40
class PublicationProvenanceTest(unittest.TestCase):
    def test_provenance_and_asset_integrity(self):
        for fresh in (False,True):
            with self.subTest(fresh=fresh),tempfile.TemporaryDirectory() as directory:
                out=Path(directory)
                for name in ("index.html","comparison.html"):
                    (out/name).write_text("<html><head></head><body>synthetic</body></html>")
                (out/"assets").mkdir()
                asset=out/"assets/app.js"
                asset.write_text("/* unchanged runtime fixture */")
                digest=hashlib.sha256(asset.read_bytes()).hexdigest()
                (out/"MANIFEST.sha256.json").write_text("{}")
                cmd=[sys.executable,str(ROOT/"publication/prepare.py"),str(out),"--source-commit",COMMIT]
                if fresh: cmd.append("--fresh-build")
                subprocess.run(cmd,check=True,capture_output=True,text=True)
                data=json.loads((out/"PUBLICATION_MANIFEST.json").read_text())
                self.assertEqual(data["runtimeBuildSourceCommit"],COMMIT if fresh else None)
                self.assertEqual(data["runtimeBundlesUnchanged"],not fresh)
                self.assertTrue(data["publicationStepRuntimeBundlesUnchanged"])
                self.assertEqual(data["files"]["assets/app.js"],digest)
                for name,expected in data["files"].items():
                    self.assertEqual(hashlib.sha256((out/name).read_bytes()).hexdigest(),expected)
                self.assertIn(COMMIT,(out/"publication.html").read_text())
                self.assertNotEqual(subprocess.run(cmd,capture_output=True).returncode,0)
if __name__=="__main__": unittest.main()
