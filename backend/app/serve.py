"""One process and database for desktop HTTP and phone HTTPS listeners."""
import argparse
import asyncio
from contextlib import contextmanager
import os
from pathlib import Path
import signal

import uvicorn


class Listener(uvicorn.Server):
    @contextmanager
    def capture_signals(self):
        yield


async def run(args):
    from backend.app.main import app
    listeners = [Listener(uvicorn.Config(app, host='127.0.0.1', port=args.port, proxy_headers=False))]
    if args.cert and args.key:
        listeners.append(Listener(uvicorn.Config(app, host=args.tls_host, port=args.tls_port,
            ssl_certfile=args.cert, ssl_keyfile=args.key, proxy_headers=False)))
    def stop(*_):
        for listener in listeners:
            listener.should_exit = True
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    await asyncio.gather(*(listener.serve() for listener in listeners))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--tls-port', type=int, default=8443)
    parser.add_argument('--tls-host', default='0.0.0.0')
    parser.add_argument('--cert')
    parser.add_argument('--key')
    args=parser.parse_args()
    lock_path=Path(os.environ.get('T_CHAT_DB','data/chat.db')).parent / 'server.lock'
    lock_path.parent.mkdir(parents=True,exist_ok=True)
    with lock_path.open('a+b') as lock:
        lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        asyncio.run(run(args))


if __name__=='__main__':
    main()
