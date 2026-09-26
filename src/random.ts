export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export function newId(): string {
  return crypto.randomUUID();
}
