#!/usr/bin/env python3
"""Apply publication-only notices to an existing root static demo; never rebuild JS."""
import argparse, hashlib, json, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--source-commit',required=True);p.add_argument('--fresh-build',action='store_true');a=p.parse_args()
assert re.fullmatch('[0-9a-f]{40}',a.source_commit), 'Exact source commit required'
out=Path(a.output).resolve();here=Path(__file__).resolve().parent
assert (out/'index.html').is_file() and (out/'comparison.html').is_file()
assert not (out/'PUBLICATION_MANIFEST.json').exists(), 'Already prepared: inspect rather than overwrite'
source='https://github.com/pengveloper/MyMonitor-Evidence-Desk/tree/'+a.source_commit
before={str(f.relative_to(out)):hashlib.sha256(f.read_bytes()).hexdigest() for f in out.rglob('*') if f.is_file()}
for name in ['index.html','comparison.html']:
 f=out/name;s=f.read_text();assert s.count('</head>')==1 and s.count('</body>')==1
 s=s.replace('</head>','<link rel="stylesheet" href="/publication.css"></head>')
 s=s.replace('</body>','<a class="publication-link" href="/publication.html">합성 평가판 · 소스/제한</a></body>')
 f.write_text(s)
(out/'publication.html').write_text((here/'notice.html').read_text().replace('__SOURCE_URL__',source))
(out/'publication.css').write_bytes((here/'notice.css').read_bytes())
readme=(here.parent/'README.md').read_text().replace('](docs/(','](docs/(')
readme=readme.replace('](docs/design/evidence-desk/PARTICIPANT_TASKS.md)','](/PARTICIPANT_TASKS.md)')
readme=readme.replace('](demo/evidence-desk/',']('+source+'/demo/evidence-desk/').replace('](docs/design/evidence-desk/',']('+source+'/docs/design/evidence-desk/')
(out/'README.md').write_text(readme)
original=out/'MANIFEST.sha256.json'
if original.exists():original.rename(out/'ORIGINAL_MANIFEST.sha256.json')
after={str(f.relative_to(out)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.rglob('*')) if f.is_file()}
changed=sorted(k for k,v in after.items() if before.get(k)!=v)
assert all(k in ['index.html','comparison.html','README.md','publication.html','publication.css','ORIGINAL_MANIFEST.sha256.json'] for k in changed), changed
assert all(after[k]==v for k,v in before.items() if k.startswith('assets/')), 'Runtime asset changed'
manifest={'schemaVersion':1,'sourceRepository':'https://github.com/pengveloper/MyMonitor-Evidence-Desk','sourceCommit':a.source_commit,'originalMyMonitorRevision':'3efdb24310096a7e7aa69237fc96fb00fd4067c8','originalSourceZipSha256':'e9b0c8bdf40741f1b294307ada012eee8f6252b40d98d9a986cf8ecd3c64d251','originalStaticZipSha256':'7e7d90fa25212900f6e7903140f25d0fcb4d1014cd88e99b5993b501f6456c6f','artifactKind':'fresh-static-build' if a.fresh_build else 'original-reviewed-static-package','runtimeBuildSourceCommit':a.source_commit if a.fresh_build else None,'runtimeBundlesUnchanged':not a.fresh_build,'publicationStepRuntimeBundlesUnchanged':True,'publicationOnlyChangedFiles':changed,'originalManifestRenamedTo':'ORIGINAL_MANIFEST.sha256.json','files':after,'knownLimitations':['MAP_COMPONENT_FAULT_QA ENVIRONMENT_BLOCKED/NOT_RUN','APP_WEBGL_FAULT_E2E NOT_RUN','Physical Fold/touch NOT_TESTED','EXTERNAL_USER_VALIDATION NOT_STARTED']}
f=out/'PUBLICATION_MANIFEST.json';f.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sourceCommit':a.source_commit,'files':len(after),'changed':changed,'manifestSha256':hashlib.sha256(f.read_bytes()).hexdigest()},ensure_ascii=False))
