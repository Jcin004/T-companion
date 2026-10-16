// SPDX-License-Identifier: AGPL-3.0-only
export const DEFAULT_HISTORY_LIMIT=30;
export const MAX_HISTORY_LIMIT=2000;
export function validateHistoryLimit(value){if(!Number.isInteger(value)||value<0||value>MAX_HISTORY_LIMIT)throw Error('历史消息条数应为 0–2000 的整数');return value;}
export function historyLimit(data,sid){const session=data.sessions.find(s=>s.id===sid);return validateHistoryLimit(session?.history_limit??data.settings.history_limit??DEFAULT_HISTORY_LIMIT);}
