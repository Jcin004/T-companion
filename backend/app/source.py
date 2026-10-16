"""Export the committed source tree, never arbitrary files from the runtime directory."""
from pathlib import Path
import subprocess

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter()
ROOT = Path(__file__).resolve().parents[2]
@router.get('/api/v1/source')
def source():
    try:
        def git(*args):
            return subprocess.run(
                ['git', '-C', str(ROOT), *args], check=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
            ).stdout

        # An extracted source folder might live below an unrelated checkout.
        # Never package that parent repository by accident.
        top = Path(git('rev-parse', '--show-toplevel').decode().strip()).resolve()
        if top != ROOT.resolve():
            raise ValueError('Source root is not the repository root')
        revision = git('rev-parse', 'HEAD').decode().strip()
        output = git('archive', '--format=zip', '--prefix=T-chat/', revision)
    except (OSError, ValueError, subprocess.SubprocessError):
        raise HTTPException(
            503, '无法读取已提交版本源码，请使用随安装包提供的对应源码包。',
        ) from None
    return Response(output, media_type='application/zip', headers={
        'Content-Disposition': 'attachment; filename="t-chat-source.zip"',
        'X-T-Source-Revision': revision,
    })
