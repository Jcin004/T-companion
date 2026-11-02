// SPDX-License-Identifier: AGPL-3.0-only
// Rectangular sprite adapter around the unchanged LPC square-copy primitive.
import {drawFrameToFrame} from './lpc-frame-copy.js';
export function copyOutfitFrame(context, source, x, y) {
  const scale = source.width / 64, tile = 32 * scale;
  if (![1, 2].includes(scale) || source.height !== 96 * scale) throw Error('穿搭画布尺寸无效');
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    drawFrameToFrame(context, {x: x + col * tile, y: y + row * tile}, tile,
      source, {x: col * tile, y: row * tile}, tile);
  }
}
