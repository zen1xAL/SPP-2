const CURSOR_PREFIX = 'cursor:';

export function encodeRelayCursor(offset: number): string {
  return Buffer.from(`${CURSOR_PREFIX}${offset}`).toString('base64');
}

export function decodeRelayCursor(cursor?: string | null): number | null {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    if (!decoded.startsWith(CURSOR_PREFIX)) {
      return null;
    }
    const parsed = parseInt(decoded.slice(CURSOR_PREFIX.length), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}
