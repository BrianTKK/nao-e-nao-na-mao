import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, DEMO_SPOTS, DEMO_USERS, DEMO_VENUE } from '../data/demo';

const root = new URL('../../../', import.meta.url);
const testUsers = JSON.parse(readFileSync(new URL('db/test-users.json', root), 'utf8')) as {
  password: string;
  users: { email: string; full_name: string; role: string; appearance: string }[];
};
const seedSql = readFileSync(new URL('db/seed.sql', root), 'utf8');

describe('os dados simulados batem com o seed do banco', () => {
  it('mesmas contas de teste e mesma senha', () => {
    expect(testUsers.password).toBe(DEMO_PASSWORD);
    expect(testUsers.users.map((u) => [u.email, u.full_name, u.role, u.appearance])).toEqual(
      DEMO_USERS.map((u) => [u.email, u.fullName, u.role, u.appearance]),
    );
  });

  it('mesmo bar e mesmos locais', () => {
    expect(seedSql).toContain(DEMO_VENUE.id);
    expect(seedSql).toContain(DEMO_VENUE.name);
    for (const s of DEMO_SPOTS) expect(seedSql).toContain(`'${s.code}', '${s.label}'`);
  });
});
