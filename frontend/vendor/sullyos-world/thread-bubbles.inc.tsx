const ThreadBubbles: React.FC<{
    thread: WorldThread;
    selfId: string;
    members: CharacterProfile[];
    npcs: WorldProfile['npcs'];
    showNames?: boolean;
    onPick?: (m: WorldChatMessage) => void;
}> = ({ thread, selfId, members, npcs, showNames, onPick }) => {
    const avatarOf = (id: string) => members.find(m => m.id === id)?.avatar;
    const emojiOf = (id: string) => npcs.find(n => n.id === id)?.emoji || '🙂';
    const isNpc = (id: string) => npcs.some(n => n.id === id);
    const els: React.ReactNode[] = [];
    let lastTime = '';
    thread.messages.forEach(m => {
        if (m.storyTime !== lastTime) {
            lastTime = m.storyTime;
            els.push(
                <div key={`div_${m.id}`} className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[8.5px] text-white/40 font-bold tracking-wider">{m.storyTime}</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>
            );
        }
        const mine = m.fromId === selfId;
        els.push(
            <div key={m.id} className={`flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && (
                    avatarOf(m.fromId)
                        ? <TokenImg value={avatarOf(m.fromId)} className="w-[22px] h-[22px] rounded-full object-cover shrink-0" alt="" />
                        : <div className="w-[22px] h-[22px] rounded-full bg-white/15 flex items-center justify-center text-[11px] shrink-0">{isNpc(m.fromId) ? emojiOf(m.fromId) : m.fromName.slice(0, 1)}</div>
                )}
                <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                    {!mine && showNames && <div className="text-[8.5px] text-white/45 font-bold mb-0.5 px-1">{m.fromName}{isNpc(m.fromId) ? ' · NPC' : ''}</div>}
                    <div role={onPick ? 'button' : undefined} onClick={onPick ? () => onPick(m) : undefined}
                        className={`px-2.5 py-1.5 text-[11px] leading-[1.5] shadow-sm ${onPick ? 'cursor-pointer active:opacity-80 transition-opacity' : ''} ${mine
                        ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-emerald-400 to-emerald-500 text-white'
                        : 'rounded-2xl rounded-bl-md bg-white/95 text-slate-800'}`}>
                        {m.text}
                    </div>
                </div>
            </div>
        );
    });
    return <>{els}</>;
};
