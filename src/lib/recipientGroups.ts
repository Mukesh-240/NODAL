// Recipient picker data: the VIT-AP directory grouped the way a student thinks
// about it (which hostel block / which office), so they choose who gets the mail.
// Client-safe — only reads the static directory.
import { VIT_AP_DIRECTORY as D } from '@/lib/routingMatrix';

type DirectoryKey = keyof typeof D;

export interface RecipientOption {
  id: DirectoryKey;
  label: string;
  email: string;
}

export interface RecipientGroup {
  label: string;
  options: RecipientOption[];
}

const GROUP_KEYS: { label: string; keys: DirectoryKey[] }[] = [
  {
    label: "Men's Hostels (MH)",
    keys: [
      'wardenMH01', 'wardenMH02', 'wardenMH03', 'wardenMH04', 'wardenMH05', 'wardenMH06', 'wardenMH07',
      'wardenFoodMH', 'wardenDisciplineMH', 'chiefWardenMH',
    ],
  },
  {
    label: 'Ladies Hostels (LH)',
    keys: ['wardenLH01_02', 'wardenLH03_04', 'wardenFoodLH', 'wardenDisciplineLH', 'chiefWardenLH'],
  },
  {
    label: 'Campus Offices',
    keys: ['estatesOffice', 'ctsITServices', 'deanAcademic', 'studentWelfare', 'studentServices', 'registrarOffice'],
  },
];

export const RECIPIENT_GROUPS: RecipientGroup[] = GROUP_KEYS.map(({ label, keys }) => ({
  label,
  options: keys.map((id) => ({ id, label: D[id].name, email: D[id].email })),
}));

const ALL_OPTIONS = RECIPIENT_GROUPS.flatMap((g) => g.options);

export function findRecipient(id: string): RecipientOption | undefined {
  return ALL_OPTIONS.find((o) => o.id === id);
}

// Pre-select the department the router chose; '' when it isn't in the list.
export function defaultRecipientId(departmentName: string): string {
  return ALL_OPTIONS.find((o) => o.label === departmentName)?.id ?? '';
}
