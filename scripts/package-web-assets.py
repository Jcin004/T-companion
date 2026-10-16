"""Refresh a built Capacitor APK's bundled web files before alignment and signing.

Native code/resources are retained unchanged. Run npm run build first. This is
also useful when the Windows SDK download is unavailable and CI built the shell.
"""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

parser=argparse.ArgumentParser()
parser.add_argument('input_apk',type=Path)
parser.add_argument('output_apk',type=Path)
args=parser.parse_args()
if args.input_apk.resolve()==args.output_apk.resolve():
    parser.error('Input and output must differ')
root=Path(__file__).resolve().parents[1]
web=root/'dist'
if not (web/'index.html').is_file():
    parser.error('Run npm run build first')
with ZipFile(args.input_apk) as original, ZipFile(args.output_apk,'w',ZIP_DEFLATED) as output:
    for entry in original.infolist():
        if entry.filename.startswith('assets/public/'):
            continue
        if entry.filename.startswith('META-INF/') and entry.filename.upper().endswith(('.SF','.RSA','.DSA','.EC','MANIFEST.MF')):
            continue
        output.writestr(entry,original.read(entry))
    for path in web.rglob('*'):
        if path.is_file():
            output.write(path,'assets/public/'+path.relative_to(web).as_posix())
print('Web assets packaged; run zipalign and sign-trial.ps1 before installing.')
