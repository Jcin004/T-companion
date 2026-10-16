// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from AI Virtual Phone / float, lib/sse-json.ts
// https://github.com/Jcin004/float/blob/c1b0ea74d7690beae31bc7c9e2a8c382fa4b151b/lib/sse-json.ts
// Upstream contributor: yechen1844. Original blob: e9321336ed3ca9ec46aff65fd54cd486c5108937
// Modified for T- on 2026-10-15: removed TypeScript types for native browser modules.
// Original parsing logic retained. See LICENSE and THIRD_PARTY_NOTICES.md.
// ── 容错 SSE-JSON 解析器 ─────────────────────────────
// 非规范中转站会把超长 JSON data 行从中间冲刷切开（典型症状：JSON Parse error:
// Unterminated string），甚至在断口处插入空行使其被切成两个"事件"。
// 这里做碎片重组：解析失败的记录先暂存（carry），与后续片段直接拼接再试；
// 拼接后仍失败但新片段自身可解析时，判定旧暂存为垃圾（keepalive 等）丢弃。
// 三条流式路径（主聊天文本流 / 原生工具流 / 工坊文本流）共用。

const MAX_CARRY_CHARS = 8_000_000;

export function createSseJsonParser() {
    let carry = "";

    const tryParse = (text) => {
        try {
            return { ok: true, value: JSON.parse(text) };
        } catch {
            return { ok: false };
        }
    };

    const consumeRecord = (record, out) => {
        if (!record || record === "[DONE]") {
            if (record === "[DONE]") carry = "";
            return;
        }
        if (carry) {
            const joined = tryParse(carry + record);
            if (joined.ok) {
                carry = "";
                out.push(joined.value);
                return;
            }
            const alone = tryParse(record);
            if (alone.ok) {
                // 新片段自身完整：旧暂存是拼不回去的垃圾，丢弃止损
                carry = "";
                out.push(alone.value);
                return;
            }
            carry = carry.length + record.length > MAX_CARRY_CHARS ? "" : carry + record;
            return;
        }
        const alone = tryParse(record);
        if (alone.ok) {
            out.push(alone.value);
            return;
        }
        carry = record.length > MAX_CARRY_CHARS ? "" : record;
    };

    return {
        pushEvent(eventText) {
            const out = [];
            const records = [];
            for (const line of eventText.split("\n")) {
                if (line.startsWith("data:")) {
                    // SSE 规范：冒号后至多一个空格是分隔符；不能用 trim，
                    // 否则会破坏被切开的 JSON 字符串里的边界空格
                    records.push(line.slice(5).replace(/^ /, ""));
                } else if (/^(event:|id:|retry:|:)/.test(line)) {
                    continue; // SSE 字段/注释行（keepalive）
                } else if (line) {
                    // 无 data: 前缀的裸行：中转把长行切开产生的延续片段
                    if (records.length > 0) records[records.length - 1] += line;
                    else records.push(line);
                }
            }
            for (const record of records) consumeRecord(record, out);
            return out;
        },
        flush() {
            if (!carry) return [];
            const last = tryParse(carry);
            carry = "";
            return last.ok ? [last.value] : [];
        },
    };
}
