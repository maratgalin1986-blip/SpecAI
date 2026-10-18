// Test helper (not used by the app): an in-memory stand-in for the BotChat and
// BotReply tables with the few Prisma calls lib/groupBot.ts makes. `{ not }`
// keeps SQL semantics (NULL never matches), as in Postgres.

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (key === 'OR') {
      if (!(cond as Row[]).some((w) => matches(row, w))) return false;
      continue;
    }
    const value = row[key];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
      continue;
    }
    if (typeof cond === 'object') {
      const c = cond as Row;
      if ('not' in c && (value === null || value === undefined || value === c.not)) return false;
      if ('lt' in c && !(typeof value === 'number' && value < (c.lt as number))) return false;
      if ('gt' in c && !(typeof value === 'number' && value > (c.gt as number))) return false;
      if ('gte' in c && !(value instanceof Date && value.getTime() >= (c.gte as Date).getTime())) {
        return false;
      }
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in (value as Row)) {
      row[key] = (row[key] as number) + ((value as Row).increment as number);
    } else if (value && typeof value === 'object' && 'decrement' in (value as Row)) {
      row[key] = (row[key] as number) - ((value as Row).decrement as number);
    } else {
      row[key] = value;
    }
  }
}

export function createBotDb() {
  const chats = new Map<string, Row>();
  const replies = new Map<string, Row>();
  const state = { bids: 0 };

  const chatDefaults = (data: Row): Row => ({
    title: null,
    username: null,
    quiet: false,
    // «Тихий режим» is the column's default, as in Postgres.
    silent: true,
    canWrite: true,
    removedAt: null,
    repliesToday: 0,
    repliesDay: null,
    addedAt: new Date(),
    ...data,
  });

  const botChat = {
    findUnique: async ({ where }: { where: { chatId: string } }) => {
      const row = chats.get(where.chatId);
      return row ? { ...row } : null;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { chatId: string };
      create: Row;
      update: Row;
    }) => {
      const row = chats.get(where.chatId);
      if (row) apply(row, update);
      else chats.set(where.chatId, chatDefaults(create));
      return { ...chats.get(where.chatId)! };
    },
    update: async ({ where, data }: { where: { chatId: string }; data: Row }) => {
      const row = chats.get(where.chatId);
      if (!row) throw new Error('not found');
      apply(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const row of chats.values()) {
        if (matches(row, where)) {
          apply(row, data);
          count += 1;
        }
      }
      return { count };
    },
    findMany: async () => [...chats.values()].map((row) => ({ ...row })),
  };

  const botReply = {
    create: async ({ data }: { data: Row }) => {
      const id = data.orderId as string;
      if (replies.has(id)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const row = { threadId: null, createdAt: new Date(), followUpAt: null, ...data };
      replies.set(id, row);
      return { ...row };
    },
    count: async ({ where }: { where: Row }) =>
      [...replies.values()].filter((row) => matches(row, where)).length,
    findUnique: async ({ where }: { where: { orderId: string } }) => {
      const row = replies.get(where.orderId);
      return row ? { ...row } : null;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const row of replies.values()) {
        if (matches(row, where)) {
          apply(row, data);
          count += 1;
        }
      }
      return { count };
    },
    deleteMany: async ({ where }: { where: Row }) => {
      let count = 0;
      for (const [id, row] of replies) {
        if (matches(row, where)) {
          replies.delete(id);
          count += 1;
        }
      }
      return { count };
    },
  };

  const bid = { count: async () => state.bids };

  // Only what onChatMigrated touches: the pick of the daily post (lib/channelTarget.ts).
  const settings = new Map<string, string>();
  const appSetting = {
    findUnique: async ({ where }: { where: { key: string } }) => {
      const value = settings.get(where.key);
      return value === undefined ? null : { key: where.key, value };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value?: string };
    }) => {
      const value = settings.has(where.key)
        ? (update.value ?? settings.get(where.key)!)
        : create.value;
      settings.set(where.key, value);
      return { key: where.key, value };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { key: string; value: string };
      data: { value: string };
    }) => {
      if (settings.get(where.key) !== where.value) return { count: 0 };
      settings.set(where.key, data.value);
      return { count: 1 };
    },
  };

  // An interactive transaction: a throw rolls both tables back.
  const snapshot = (map: Map<string, Row>) => new Map([...map].map(([k, v]) => [k, { ...v }]));
  const restore = (map: Map<string, Row>, saved: Map<string, Row>) => {
    map.clear();
    for (const [k, v] of saved) map.set(k, v);
  };
  async function $transaction<T>(fn: (tx: typeof client) => Promise<T>): Promise<T> {
    const savedChats = snapshot(chats);
    const savedReplies = snapshot(replies);
    try {
      return await fn(client);
    } catch (error) {
      restore(chats, savedChats);
      restore(replies, savedReplies);
      throw error;
    }
  }
  const client = { botChat, botReply, bid, appSetting };

  return {
    prisma: { ...client, $transaction },
    settings,
    chats,
    replies,
    state,
    reset() {
      chats.clear();
      replies.clear();
      settings.clear();
      state.bids = 0;
    },
  };
}
