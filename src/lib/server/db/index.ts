// Panel database client.
//
// IMPORTANT: imported by the operations worker outside SvelteKit — keep this
// module free of $app/* and $env/* imports.
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { env } from '../env';

const client = createClient({ url: env('DATABASE_URL') });

// SQLite via libsql: WAL journal + a busy timeout make panel/worker
// multi-process access safe for this single-server design.
await client.execute('PRAGMA journal_mode = WAL');
await client.execute('PRAGMA busy_timeout = 10000');
await client.execute('PRAGMA foreign_keys = ON');

export const db = drizzle(client, { schema });
export { client };
