export type Urgency = 'overdue' | 'due_soon' | 'upcoming';

export interface ScheduleItem {
  item: string;
  interval_km: number | null;
  next_due_km: number | null;
  next_due_date: string | null;
  urgency: Urgency;
  source: string;
}
