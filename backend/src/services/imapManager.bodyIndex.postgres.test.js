import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

vi.mock('imapflow', () => ({ ImapFlow: vi.fn() }));
vi.mock('./db.js', () => ({ query: vi.fn() }));
vi.mock('../routes/oauth.js', () => ({ refreshMicrosoftToken: vi.fn(), refreshGoogleToken: vi.fn() }));
vi.mock('./emailSanitizer.js', () => ({ sanitizeEmail: vi.fn() }));
vi.mock('./encryption.js', () => ({ decrypt: vi.fn() }));
vi.mock('./aiProvider.js', () => ({ getAiStatus: vi.fn(), completeText: vi.fn() }));
vi.mock('./pushNotifications.js', () => ({ sendPushToUser: vi.fn() }));
vi.mock('./hostValidation.js', () => ({ resolveForConnection: vi.fn(), createPinnedLookup: vi.fn() }));
vi.mock('./connectionPolicy.js', () => ({ getConnectionPolicy: vi.fn() }));
vi.mock('./spamPipeline.js', () => ({ classifyAndTagMessage: vi.fn() }));
vi.mock('./mailAccess.js', () => ({ getAccountAddresses: vi.fn(async () => []) }));
import { BODY_INDEX_PENDING } from './imapManager.js';

// The historical body indexer drained every message without a body, newest first: half a million
// Gmail rows, several GB, on a 19 GB root disk. It only takes the last 90 days now. Uses only a
// connection-local temporary table in an explicitly supplied database.
describe.skipIf(!process.env.MAILFLOW_TEST_DATABASE_URL)('historical body indexer backlog', () => {
  let database;

  beforeAll(async () => {
    database = new pg.Client({ connectionString: process.env.MAILFLOW_TEST_DATABASE_URL });
    await database.connect();
    await database.query(`
      CREATE TEMP TABLE messages (uid int, body_html text, body_text text, body_attempted_at timestamptz, date timestamptz);
      INSERT INTO messages VALUES
        (1, NULL, NULL, NULL, NOW() - INTERVAL '1 day'),
        (2, NULL, NULL, NULL, NOW() - INTERVAL '89 days'),
        (3, NULL, NULL, NULL, NOW() - INTERVAL '91 days'),
        (4, NULL, NULL, NULL, NOW() - INTERVAL '3 years'),
        (5, NULL, NULL, NULL, NULL),
        (6, '<p>cached</p>', NULL, NULL, NOW() - INTERVAL '1 day'),
        (7, NULL, 'cached', NULL, NOW() - INTERVAL '1 day'),
        (8, NULL, NULL, NOW(), NOW() - INTERVAL '1 day');
    `);
  });
  afterAll(async () => { await database?.end(); });

  it('takes recent rows with no body and no attempt, and leaves older mail to be fetched when opened', async () => {
    const { rows } = await database.query(`SELECT uid FROM messages WHERE ${BODY_INDEX_PENDING} ORDER BY uid`);
    expect(rows.map(r => r.uid)).toEqual([1, 2]);
  });
});
