/**
 * Dados de demonstração do bar fictício, os mesmos de supabase/seed.sql e
 * supabase/test-users.json (o teste demo.test.ts confere que não divergem).
 */
import type { MenuSection, Spot, StaffMember, Venue } from '../domain';

export const DEMO_VENUE_ID = '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01';

/** Senha das contas de TESTE da demonstração. Não é segredo e não vale para nada real. */
export const DEMO_PASSWORD = 'demo-nenm-2026';

export const DEMO_MENU: MenuSection[] = [
  {
    section: 'Chopes e cervejas',
    items: [
      { name: 'Chope claro 300 ml', price: 12.9 },
      { name: 'Chope escuro 300 ml', price: 14.9 },
      { name: 'Long neck', price: 13.0 },
    ],
  },
  {
    section: 'Drinks',
    items: [
      { name: 'Caipirinha de limão', price: 24.0 },
      { name: 'Gin tônica', price: 32.0 },
      { name: 'Drink sem álcool da casa', price: 18.0 },
    ],
  },
  {
    section: 'Petiscos',
    items: [
      { name: 'Batata frita', price: 29.0 },
      { name: 'Pastel de queijo (6 un.)', price: 26.0 },
      { name: 'Bolinho de mandioca', price: 31.0 },
    ],
  },
];

export const DEMO_VENUE: Venue = {
  id: DEMO_VENUE_ID,
  name: 'Bar Esquina da Vila',
  neighborhood: 'Vila Madalena',
  city: 'São Paulo',
  helpPhrase: 'Pedir um "drink Margarida" no balcão',
  menu: DEMO_MENU,
};

const spot = (id: string, code: string, label: string, kind: Spot['kind']): Spot => ({
  id,
  venueId: DEMO_VENUE_ID,
  code,
  label,
  kind,
  active: true,
});

export const DEMO_SPOTS: Spot[] = [
  spot('spot-bf', 'ESQBF7K2', 'Banheiro feminino', 'restroom'),
  spot('spot-bm', 'ESQBM4P9', 'Banheiro masculino', 'restroom'),
  spot('spot-m12', 'ESQM12T3', 'Mesa 12', 'table'),
  spot('spot-m07', 'ESQM07H6', 'Mesa 7', 'table'),
  spot('spot-bal', 'ESQBAL3W', 'Balcão', 'bar'),
  spot('spot-ext', 'ESQEXT9R', 'Área externa', 'outdoor'),
];

export interface DemoUser extends StaffMember {
  email: string;
}

const member = (
  id: string,
  email: string,
  fullName: string,
  role: StaffMember['role'],
  jobTitle: string,
  appearance: string,
  trainedAt: string,
): DemoUser => ({ id, email, venueId: DEMO_VENUE_ID, fullName, role, jobTitle, appearance, trainedAt, active: true });

export const DEMO_USERS: DemoUser[] = [
  member('staff-diego', 'diego@bar-esquina.test', 'Diego Santos', 'staff', 'Segurança', 'camisa preta', '2026-08-12'),
  member('staff-ana', 'ana@bar-esquina.test', 'Ana Lima', 'staff', 'Garçonete', 'avental verde', '2026-08-12'),
  member('staff-rafael', 'rafael@bar-esquina.test', 'Rafael Souza', 'staff', 'Bartender', 'boné vermelho', '2026-09-03'),
  member('staff-marta', 'marta@bar-esquina.test', 'Marta Ribeiro', 'manager', 'Gerente', 'blazer azul', '2026-07-28'),
];
