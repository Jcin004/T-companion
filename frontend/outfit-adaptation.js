// SPDX-License-Identifier: AGPL-3.0-only
// Shared originals and wearer-owned adjustments. No DOM or persistence.
const copy = value => JSON.parse(JSON.stringify(value));
export function originalEdition(asset, revision = asset.revision) {
  const edition = revision === asset.revision ? asset : asset.editions?.find(e => e.revision === revision);
  if (!edition) throw Error('衣物原版不存在，请重新打开衣柜');
  return edition;
}
export function resolvedGarment(asset, person) {
  const adjustment = person?.adaptations?.[asset.id];
  if (!adjustment) return asset;
  const original = originalEdition(asset, adjustment.revision);
  return {...asset, project: adjustment.project || original.project, ready: adjustment.ready || original.ready, draw_order: original.draw_order};
}
export function ensureAdaptation(person, asset) {
  if (!person) throw Error('先为人物选择本体');
  if (asset.kind === 'body') throw Error('人物本体请在本体编辑中修改');
  if (!person.adaptations) person.adaptations = {};
  if (!person.adaptations[asset.id]) {
    const worn = person.wear.find(w => w.asset === asset.id);
    person.adaptations[asset.id] = {revision: asset.revision, fit: copy(worn?.fit || {scale: 1, x: 0, y: 0})};
  }
  return person.adaptations[asset.id];
}
export function wearGarment(person, asset) {
  const adjustment = ensureAdaptation(person, asset);
  // The caller removes any previous item in the same slot.
  person.wear.push({asset: asset.id, fit: copy(adjustment.fit)});
}
export function adaptationDrawingChange(catalog, owner, id, method, body) {
  if (!['PATCH', 'POST'].includes(method) || body?.expected_revision !== catalog.revision) throw Error('穿搭已改变，请重新打开');
  const next = copy(catalog), asset = next.assets.find(a => a.id === id);
  if (!asset) throw Error('衣物已删除');
  const person = next.people[owner], adjustment = ensureAdaptation(person, asset);
  if (method === 'PATCH') adjustment.draft = copy(body.project);
  else {
    const old = resolvedGarment(asset, person).project;
    adjustment.project = copy(body.project);
    for (let d = 0; d < 4; d++) for (const pose of [0, 2]) {
      const i = d * 3 + pose;
      if (old.frames[i] === old.frames[d * 3 + 1] && adjustment.project.frames[i] === old.frames[i]) adjustment.project.frames[i] = adjustment.project.frames[d * 3 + 1];
    }
    adjustment.ready = [0, 1, 2, 3].map(d => /[^0]/.test(adjustment.project.frames[d * 3 + 1]));
    delete adjustment.draft;
  }
  return next;
}
