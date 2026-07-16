// Centralized Lemtel mock data for Phase 2 UI development
// Used until FusionPBX / Telnyx / ElevenLabs connections are wired live.

export interface LemtelCustomer {
  id: string;
  name: string;
  industry: string;
  contact_email: string;
  contact_phone: string;
  extensions: number;
  dids: number;
  status: 'active' | 'suspended' | 'trial';
  created_at: string;
}

export interface LemtelExtension {
  id: string;
  number: string;
  display_name: string;
  customer_id: string;
  customer_name: string;
  voicemail: boolean;
  registered: boolean;
  device: string;
}

export interface LemtelDID {
  id: string;
  number: string;
  customer_id: string;
  customer_name: string;
  routing: 'extension' | 'queue' | 'ivr' | 'voice_agent';
  destination: string;
  sms_enabled: boolean;
  monthly_cost: number;
}

export interface LemtelCDR {
  id: string;
  direction: 'inbound' | 'outbound' | 'missed';
  from_number: string;
  to_number: string;
  duration_seconds: number;
  start_time: string;
  customer_name: string;
  recording_url?: string;
  ai_summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface LemtelSMSThread {
  id: string;
  customer_phone: string;
  customer_name: string;
  last_message: string;
  last_message_at: string;
  unread: number;
  language: 'en' | 'fr';
}

export interface LemtelVoiceAgent {
  id: string;
  name: string;
  customer_name: string;
  language: 'en' | 'fr' | 'bilingual';
  did: string;
  total_calls: number;
  avg_duration: number;
  satisfaction: number;
  status: 'active' | 'paused';
}

export interface LemtelIVR {
  id: string;
  name: string;
  customer_name: string;
  greeting: string;
  options: { key: string; action: string; destination: string }[];
  language: 'en' | 'fr' | 'bilingual';
}

export const MOCK_CUSTOMERS: LemtelCustomer[] = [
  { id: 'c1', name: 'Dr. Tremblay Dental Clinic', industry: 'Healthcare', contact_email: 'admin@tremblaydental.ca', contact_phone: '+15145550101', extensions: 6, dids: 2, status: 'active', created_at: '2025-03-12' },
  { id: 'c2', name: 'Bouchard & Associates Law', industry: 'Legal', contact_email: 'office@bouchardlaw.ca', contact_phone: '+15145550102', extensions: 12, dids: 3, status: 'active', created_at: '2024-11-04' },
  { id: 'c3', name: 'Royal Realty Montreal', industry: 'Real Estate', contact_email: 'team@royalrealty.ca', contact_phone: '+15145550103', extensions: 8, dids: 4, status: 'active', created_at: '2025-01-20' },
  { id: 'c4', name: 'Bistro Le Coin', industry: 'Restaurant', contact_email: 'hello@bistrolecoin.ca', contact_phone: '+15145550104', extensions: 2, dids: 1, status: 'trial', created_at: '2026-05-01' },
  { id: 'c5', name: 'Lapointe CPA', industry: 'Accounting', contact_email: 'info@lapointecpa.ca', contact_phone: '+15145550105', extensions: 5, dids: 2, status: 'active', created_at: '2025-08-15' },
];

const devices = ['Yealink T54W', 'Polycom VVX 411', 'Grandstream GXP2170', 'Softphone'];
export const MOCK_EXTENSIONS: LemtelExtension[] = Array.from({ length: 20 }, (_, i) => {
  const cust = MOCK_CUSTOMERS[i % MOCK_CUSTOMERS.length];
  return {
    id: `ext_${100 + i}`,
    number: String(100 + i),
    display_name: `Line ${100 + i} — ${cust.name.split(' ')[0]}`,
    customer_id: cust.id,
    customer_name: cust.name,
    voicemail: i % 3 !== 0,
    registered: i % 4 !== 0,
    device: devices[i % devices.length],
  };
});

export const MOCK_DIDS: LemtelDID[] = Array.from({ length: 15 }, (_, i) => {
  const cust = MOCK_CUSTOMERS[i % MOCK_CUSTOMERS.length];
  const routes = ['extension', 'queue', 'ivr', 'voice_agent'] as const;
  return {
    id: `did_${i}`,
    number: `+1514${String(5550200 + i).padStart(7, '0')}`,
    customer_id: cust.id,
    customer_name: cust.name,
    routing: routes[i % routes.length],
    destination: ['Ext 100', 'Sales Queue', 'Main IVR', 'AI Receptionist'][i % 4],
    sms_enabled: i % 2 === 0,
    monthly_cost: 2.5,
  };
});

const sentiments = ['positive', 'neutral', 'negative'] as const;
export const MOCK_CDRS: LemtelCDR[] = Array.from({ length: 50 }, (_, i) => {
  const directions = ['inbound', 'outbound', 'missed'] as const;
  const direction = directions[i % 3];
  const cust = MOCK_CUSTOMERS[i % MOCK_CUSTOMERS.length];
  return {
    id: `cdr_${i}`,
    direction,
    from_number: direction === 'outbound' ? '+15145550101' : `+1438555${String(1000 + i).padStart(4, '0')}`,
    to_number: direction === 'outbound' ? `+1438555${String(2000 + i).padStart(4, '0')}` : '+15145550101',
    duration_seconds: direction === 'missed' ? 0 : 30 + (i * 17) % 600,
    start_time: new Date(Date.now() - i * 1000 * 60 * 23).toISOString(),
    customer_name: cust.name,
    recording_url: direction !== 'missed' ? '#' : undefined,
    ai_summary: direction !== 'missed' ? `Caller asked about ${['pricing', 'appointment scheduling', 'service hours', 'billing inquiry'][i % 4]}.` : undefined,
    sentiment: direction !== 'missed' ? sentiments[i % 3] : undefined,
  };
});

export const MOCK_SMS_THREADS: LemtelSMSThread[] = [
  { id: 's1', customer_phone: '+14385551234', customer_name: 'Marie Dubois', last_message: 'Merci beaucoup pour le rendez-vous!', last_message_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(), unread: 2, language: 'fr' },
  { id: 's2', customer_phone: '+15145559876', customer_name: 'John Carter', last_message: 'Can you confirm my appointment for tomorrow?', last_message_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), unread: 0, language: 'en' },
  { id: 's3', customer_phone: '+14505557777', customer_name: 'Sophie Leclerc', last_message: 'Bonjour, je voudrais reporter ma visite.', last_message_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), unread: 1, language: 'fr' },
];

export const MOCK_VOICE_AGENTS: LemtelVoiceAgent[] = [
  { id: 'va1', name: 'AI Receptionist — Tremblay Dental', customer_name: 'Dr. Tremblay Dental Clinic', language: 'bilingual', did: '+15145550200', total_calls: 342, avg_duration: 87, satisfaction: 4.6, status: 'active' },
  { id: 'va2', name: 'After-Hours Intake — Bouchard Law', customer_name: 'Bouchard & Associates Law', language: 'fr', did: '+15145550203', total_calls: 128, avg_duration: 154, satisfaction: 4.3, status: 'active' },
];

export const MOCK_IVRS: LemtelIVR[] = [
  { id: 'ivr1', name: 'Tremblay Main Menu', customer_name: 'Dr. Tremblay Dental Clinic', language: 'bilingual', greeting: 'Welcome to Tremblay Dental. Bonjour. Press 1 for English, 2 pour français.', options: [
    { key: '1', action: 'submenu', destination: 'English Menu' },
    { key: '2', action: 'submenu', destination: 'Menu Français' },
    { key: '0', action: 'extension', destination: 'Ext 100' },
  ]},
  { id: 'ivr2', name: 'Bouchard Law After Hours', customer_name: 'Bouchard & Associates Law', language: 'fr', greeting: 'Vous avez joint le bureau de Bouchard et Associés. Nos heures sont 9h à 17h.', options: [
    { key: '1', action: 'voicemail', destination: 'General VM' },
    { key: '2', action: 'voice_agent', destination: 'After-Hours Intake' },
  ]},
  { id: 'ivr3', name: 'Royal Realty Routing', customer_name: 'Royal Realty Montreal', language: 'en', greeting: 'Royal Realty Montreal. Press 1 for sales, 2 for property management.', options: [
    { key: '1', action: 'queue', destination: 'Sales Queue' },
    { key: '2', action: 'queue', destination: 'Property Mgmt Queue' },
  ]},
  { id: 'ivr4', name: 'Bistro Reservations', customer_name: 'Bistro Le Coin', language: 'bilingual', greeting: 'Bistro Le Coin. Press 1 to make a reservation, 2 for hours.', options: [
    { key: '1', action: 'voice_agent', destination: 'Reservation Agent' },
    { key: '2', action: 'announcement', destination: 'Hours Announcement' },
  ]},
];

export const MOCK_QUEUES = [
  { id: 'q1', name: 'Sales Queue', customer_name: 'Royal Realty Montreal', strategy: 'ring-all', members: 4, waiting: 0, abandoned_today: 1 },
  { id: 'q2', name: 'Property Mgmt Queue', customer_name: 'Royal Realty Montreal', strategy: 'longest-idle', members: 3, waiting: 0, abandoned_today: 0 },
  { id: 'q3', name: 'Reception Queue', customer_name: 'Dr. Tremblay Dental Clinic', strategy: 'round-robin', members: 2, waiting: 1, abandoned_today: 2 },
];

export const MOCK_SOFTPHONE_USERS = MOCK_EXTENSIONS.slice(0, 10).map((e, i) => ({
  id: `sp_${i}`,
  username: `user${e.number}@lemtel.sip`,
  display_name: e.display_name,
  extension: e.number,
  customer_name: e.customer_name,
  registered: e.registered,
  last_seen: new Date(Date.now() - i * 1000 * 60 * 7).toISOString(),
}));
