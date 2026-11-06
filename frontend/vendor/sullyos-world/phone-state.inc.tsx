    const dmThreads = dmThreadsOf(world, ownerId);
    const [dmOpenId, setDmOpenId] = useState<string | null>(null); // null = 看联系人列表；非空 = 进了某条会话
    const group = groupThreadOf(world);
    const latestBeat = episodes[0]?.beats.find(b => b.charId === ownerId);
    const nameById = (id: string) => members.find(m => m.id === id)?.name || world.npcs.find(n => n.id === id)?.name || '?';
    const avatarById = (id: string) => members.find(m => m.id === id)?.avatar;
