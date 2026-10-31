// SPDX-License-Identifier: AGPL-3.0-only
// Legacy sessions without a mode are online. Story is reserved, not an online fallback.
export function sessionMode(session) {
  const mode = session.mode === undefined ? 'online' : session.mode;
  if (!['online', 'world', 'story'].includes(mode)) throw Error('不支持的会话类型');
  return mode;
}

export const isOnlineSession = session => sessionMode(session) === 'online';
export const isMainMemorySession = session => ['online', 'world'].includes(sessionMode(session));

export function requireMainMemorySession(data, owner, sessionId) {
  const session = data.sessions.find(item => item.id === sessionId && item.character_id === owner);
  if (!session) throw Error('会话不属于此人物');
  if (!isMainMemorySession(session)) throw Error('独立剧情不能通过普通聊天入口读取人物记忆');
  return session;
}
