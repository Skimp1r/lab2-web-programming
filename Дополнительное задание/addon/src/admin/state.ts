type PendingAction =
  | { type: 'cat:create' }
  | { type: 'cat:rename'; categoryId: number }
  | { type: 'prod:create'; categoryId: number }
  | { type: 'prod:update'; productId: number };

type AdminSession = {
  pending?: PendingAction;
};

const sessions = new Map<number, AdminSession>();

export function getAdminSession(adminTelegramId: number): AdminSession {
  const s = sessions.get(adminTelegramId) ?? {};
  sessions.set(adminTelegramId, s);
  return s;
}

export function clearPending(adminTelegramId: number) {
  const s = getAdminSession(adminTelegramId);
  delete s.pending;
}

export function setPending(adminTelegramId: number, pending: PendingAction) {
  const s = getAdminSession(adminTelegramId);
  s.pending = pending;
}

