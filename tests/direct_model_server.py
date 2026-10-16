"""Isolated model protocol fixture. No T- application server or user data."""
import asyncio
import json
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_headers=['*'], allow_methods=['*'])


@app.post('/v1/chat/completions')
async def model(request: Request):
    body = await request.json()
    from fastapi.responses import JSONResponse
    text = body['messages'][-1]['content']
    if text == 'AUTH_ERROR':
        return JSONResponse({'error': 'fixture'}, status_code=401)
    if text == 'SERVER_ERROR':
        return JSONResponse({'error': 'fixture'}, status_code=500)

    async def chunks():
        for part in ['第一段。', '第二段。']:
            yield 'data: ' + json.dumps({'choices': [{'delta': {'content': part}}]}) + '\n\n'
            await asyncio.sleep(3 if text == 'NATIVE_CHUNK_CHECK' else 1)
        if text != 'INTERRUPT':
            yield 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
    return StreamingResponse(chunks(), media_type='text/event-stream')
