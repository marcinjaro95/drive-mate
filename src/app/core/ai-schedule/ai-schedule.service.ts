import { Injectable } from '@angular/core';
import { VehicleService } from '../vehicles/vehicle.service';
import type { Vehicle } from '../models/vehicle.model';
import type { ScheduleItem } from '../models/schedule-item.model';

@Injectable({ providedIn: 'root' })
export class AiScheduleService {
  constructor(private readonly vehicleService: VehicleService) {}

  async generateAndSave(vehicle: Vehicle): Promise<ScheduleItem[]> {
    const httpRes = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss-120b:free',
        messages: [{ role: 'user', content: this.buildPrompt(vehicle) }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!httpRes.ok) throw new Error(`AI proxy error: ${httpRes.status}`);
    const envelope = await httpRes.json();
    const parsed: { items: ScheduleItem[] } = JSON.parse(envelope.choices[0].message.content);
    const filtered = parsed.items.filter(
      (i) => typeof i.source === 'string' && i.source.trim().length > 0,
    );
    await this.vehicleService.updateVehicle(vehicle.id, { ai_schedule: filtered });
    return filtered;
  }

  private buildPrompt(vehicle: Vehicle): string {
    const mileageNote = vehicle.current_mileage != null
      ? `Current mileage: ${vehicle.current_mileage} km.`
      : 'Current mileage is unknown.';

    return `You are an automotive maintenance expert. Generate a maintenance schedule for the following vehicle:

Make: ${vehicle.make}
Model: ${vehicle.model}
Year: ${vehicle.year}
Engine capacity: ${vehicle.engine_capacity}L
Fuel type: ${vehicle.fuel_type}
${mileageNote}

Return a JSON object with a single key "items" containing an array of maintenance schedule items. Each item must follow this exact shape:

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
- "interval_km" and "next_due_km" may be null if mileage-based scheduling is not applicable
- "next_due_date" may be null if date-based scheduling is not applicable
- "source" must be a non-empty string citing the manufacturer schedule or standard automotive practice — never leave it blank
- Return 8–12 items covering the most important maintenance tasks for this vehicle
- Base intervals on the manufacturer's recommended schedule where known, otherwise cite standard industry practice`;
  }
}
