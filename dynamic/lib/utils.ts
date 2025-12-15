export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateWalletAddress(): string {
  return `0x${Math.random().toString(16).substr(2, 40)}`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString();
}

