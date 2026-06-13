import { Injectable } from '@angular/core';
import { VehicleService } from '../vehicles/vehicle.service';
import type { Vehicle } from '../models/vehicle.model';
import type { ScheduleItem } from '../models/schedule-item.model';
import type { ServiceRecord } from '../models/service-record.model';

@Injectable({ providedIn: 'root' })
export class AiScheduleService {
  constructor(private readonly vehicleService: VehicleService) {}

  async generateAndSave(vehicle: Vehicle, signal?: AbortSignal, serviceRecords: ServiceRecord[] = []): Promise<ScheduleItem[]> {
    const httpRes = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: 'gpt-oss-120b:free',
        messages: [{ role: 'user', content: this.buildPrompt(vehicle, serviceRecords) }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!httpRes.ok) throw new Error(`AI proxy error: ${httpRes.status}`);
    const envelope = await httpRes.json();
    if (!Array.isArray(envelope?.choices) || !envelope.choices[0]) {
      throw new Error(`AI proxy returned unexpected response shape: ${JSON.stringify(envelope).slice(0, 200)}`);
    }
    const parsed: { items: ScheduleItem[] } = JSON.parse(envelope.choices[0].message.content);
    if (!Array.isArray(parsed?.items)) throw new Error('AI response missing items array');
    const VALID_URGENCY = new Set(['overdue', 'due_soon', 'upcoming']);
    const filtered = parsed.items
      .filter(
        (i) => typeof i.source === 'string' && i.source.trim().length > 0 && VALID_URGENCY.has(i.urgency),
      )
      .map((i) => ({ ...i, id: crypto.randomUUID() }));
    await this.vehicleService.updateVehicle(vehicle.id, { ai_schedule: filtered });
    return filtered;
  }

  private buildPrompt(vehicle: Vehicle, serviceRecords: ServiceRecord[] = []): string {
    const mileageNote = vehicle.current_mileage != null
      ? `Current mileage: ${vehicle.current_mileage} km.`
      : 'Current mileage is unknown.';

    const historySection = serviceRecords.length > 0
      ? `\nService history (${serviceRecords.length} record${serviceRecords.length > 1 ? 's' : ''}):\n` +
        serviceRecords.map(r =>
          `- ${r.label} (${r.service_date}, ${r.mileage != null ? r.mileage + ' km' : 'mileage unknown'}${r.notes ? ', ' + r.notes : ''})`
        ).join('\n')
      : '\nNo service history.';

    return `You are a vehicle maintenance expert. Generate a maintenance schedule for the following vehicle:

Make: ${vehicle.make}
Model: ${vehicle.model}
Year: ${vehicle.year}
Engine capacity: ${vehicle.engine_capacity}L
Fuel type: ${vehicle.fuel_type}
${mileageNote}
${historySection}

Return a JSON object with a single key "items" containing an array of maintenance schedule items. Each item must have exactly this shape:

{
  "item": "Oil change",
  "interval_km": 10000,
  "next_due_km": 55000,
  "next_due_date": "2025-06-01",
  "urgency": "upcoming",
  "source": "Toyota Corolla 2019 owner's manual, section 7.2"
}

Rules:
- "urgency" must be one of: "overdue", "due_soon", "upcoming"
- "interval_km" and "next_due_km" may be null if mileage-based scheduling does not apply
- "next_due_date" may be null if date-based scheduling does not apply
- "source" must be a non-empty string citing the manufacturer schedule or standard industry practice — never leave it empty
- Return 8–12 items covering the most important service actions for this vehicle
- Base intervals on the manufacturer's recommended service schedule if known, otherwise cite standard industry practice
- Use the service history to adjust "next_due_km" and "next_due_date" for each item`;
  }
}
