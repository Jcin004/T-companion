export function drawFrameToFrame(
  destCtx: CanvasRenderingContext2D,
  destPos: { x: number; y: number },
  destFrameSize: number,
  src: SpriteSource,
  srcPos: { x: number; y: number },
  srcFrameSize: number,
): void {
  if (srcFrameSize === destFrameSize) {
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x,
      destPos.y,
      destFrameSize,
      destFrameSize,
    );
  } else {
    // e.g. 64×64 source centered in 128×128 dest = offset by 32px.
    const offset = (destFrameSize - srcFrameSize) / 2;
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x + offset,
      destPos.y + offset,
      srcFrameSize,
      srcFrameSize,
    );
  }
}

