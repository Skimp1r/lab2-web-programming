const lastMenuMessageByChat = new Map<number, number>();

export function getLastMenuMessageId(chatId: number): number | undefined {
  return lastMenuMessageByChat.get(chatId);
}

export function setLastMenuMessageId(chatId: number, messageId: number) {
  lastMenuMessageByChat.set(chatId, messageId);
}

