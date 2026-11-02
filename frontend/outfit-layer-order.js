// SPDX-License-Identifier: GPL-3.0-only
// Relative move port: Floogen/FashionSense LayerManager.cs, commit 39e9e9e.
// See vendor/fashion-sense/PROVENANCE.json. No game/runtime dependencies.
export function orderedOutfitLayers(layers, direction) {
  const sorted = [...layers];
  // T- exposes the safe subset Before(Player) / After(last layer).
  for (const layer of layers) {
    const order = layer.draw_order?.[direction] || 'default';
    if (order === 'default') continue;
    sorted.splice(sorted.indexOf(layer), 1);
    const index = order === 'behind' ? sorted.findIndex(item => item.kind === 'body') : sorted.length;
    if (index < 0) throw Error('缺少人物本体图层');
    // Equivalent to MoveLayerDataItem: remove, then insert or append.
    if (sorted.length > index) sorted.splice(index, 0, layer);
    else sorted.push(layer);
  }
  return sorted;
}
