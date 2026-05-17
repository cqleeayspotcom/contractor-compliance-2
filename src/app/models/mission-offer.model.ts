export interface MissionOffer {
  mission_ref: string;
  title: string;
  category: 'pre_visite' | 'fibre' | 'btp' | 'autre';
  expected_amount_ttc: number | null;
  scheduled_at: string;
  address: {
    street: string;
    city: string;
    postal_code: string;
    department: string;
  };
  description_short: string;
  required_badges: string[];
  expires_at: string;
  offered_at: string;
}
