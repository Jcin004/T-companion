                            {tab === 'dm' && (
                                dmThreads.length === 0
                                    ? <div className="text-center text-[11px] text-white/40 pt-16">私信里还没有会话</div>
                                    : activeDm
                                        ? (() => {
                                            // 进了某条会话：顶部「← 联系人名」，下面是聊天内容
                                            const otherId = activeDm.memberIds.find(id => id !== ownerId) || '';
                                            const otherName = nameById(otherId);
                                            const folded = !dmExpanded && activeDm.messages.length > FOLD;
                                            const shownThread = folded ? { ...activeDm, messages: activeDm.messages.slice(-FOLD) } : activeDm;
                                            return (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <button onClick={() => setDmOpenId(null)} className="flex items-center gap-1 text-[11px] font-bold text-white/80 active:scale-95 transition-transform">
                                                            <CaretRight size={12} weight="bold" className="rotate-180" />{otherName}
                                                        </button>
                                                        {onEditContent && <span className="text-[8px] text-white/35">点按消息可编辑/删除</span>}
                                                    </div>
                                                    {folded && (
                                                        <button onClick={() => setDmExpanded(true)} className="w-full text-[10px] font-bold py-1.5 rounded-full bg-white/10 text-white/60 active:scale-95 transition-transform">
                                                            展开更早的 {activeDm.messages.length - FOLD} 条
                                                        </button>
                                                    )}
                                                    <ThreadBubbles thread={shownThread} selfId={ownerId} members={members} npcs={world.npcs}
                                                        onPick={onEditContent ? m => setEditing({ target: { type: 'msg', threadId: activeDm.id, msgId: m.id }, text: m.text, title: '编辑这条私信', canDelete: true }) : undefined} />
                                                </div>
                                            );
                                        })()
                                        : (
                                            // 联系人列表：每个聊过的人一行，点进去看会话
                                            <div className="space-y-1.5">
                                                {dmThreads.map(t => {
                                                    const otherId = t.memberIds.find(id => id !== ownerId) || '';
                                                    const otherName = nameById(otherId);
                                                    const av = avatarById(otherId);
                                                    const isNpc = world.npcs.some(n => n.id === otherId);
                                                    const last = t.messages[t.messages.length - 1];
                                                    return (
                                                        <button key={t.id} onClick={() => setDmOpenId(t.id)}
                                                            className="w-full flex items-center gap-2.5 rounded-2xl bg-white/95 px-3 py-2.5 text-left active:scale-[0.98] transition-transform">
                                                            {av
                                                                ? <TokenImg value={av} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                                                                : <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-[14px] shrink-0">{isNpc ? (world.npcs.find(n => n.id === otherId)?.emoji || '🙂') : otherName.slice(0, 1)}</div>}
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[12.5px] font-bold text-slate-800 truncate">{otherName}</span>
                                                                    {isNpc && <span className="text-[8px] font-bold px-1 rounded bg-slate-100 text-slate-400 shrink-0">NPC</span>}
                                                                </div>
                                                                {last && <div className="text-[10.5px] text-slate-400 truncate">{last.fromId === ownerId ? '我：' : ''}{last.text}</div>}
                                                            </div>
                                                            <span className="text-[9px] text-slate-300 shrink-0">{t.messages.length}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )
                            )}
                            {tab === 'group' && (
                                !group || group.messages.length === 0
                                    ? <div className="text-center text-[11px] text-white/40 pt-16">群里还没人说话</div>
                                    : (() => {
                                        const folded = !groupExpanded && group.messages.length > FOLD;
                                        const shownGroup = folded ? { ...group, messages: group.messages.slice(-FOLD) } : group;
                                        return (
                                            <div className="space-y-1.5">
                                                <div className="text-center text-[9px] text-white/40 font-bold pb-1">「{group.name}」 · {group.memberIds.length} 人{world.npcs.length > 0 ? ` + ${world.npcs.length} NPC` : ''}{onEditContent ? ' · 点按消息可编辑/删除' : ''}</div>
                                                {folded && (
                                                    <button onClick={() => setGroupExpanded(true)} className="w-full text-[10px] font-bold py-1.5 rounded-full bg-white/10 text-white/60 active:scale-95 transition-transform">
                                                        展开更早的 {group.messages.length - FOLD} 条
                                                    </button>
                                                )}
                                                <ThreadBubbles thread={shownGroup} selfId={ownerId} members={members} npcs={world.npcs} showNames
                                                    onPick={onEditContent ? m => setEditing({ target: { type: 'msg', threadId: group.id, msgId: m.id }, text: m.text, title: '编辑这条群消息', canDelete: true }) : undefined} />
                                            </div>
                                        );
                                    })()
                            )}
