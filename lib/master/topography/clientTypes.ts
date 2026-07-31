export type MasterTopographyClient = {
  id: string;
  name: string;
  document: string | null;
  document_normalized: string | null;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  email_normalized: string | null;
  contact_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyClientInput = {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
};

export type MasterTopographyClientListFilters = {
  q?: string;
  includeArchived?: boolean;
  limit?: number;
};
