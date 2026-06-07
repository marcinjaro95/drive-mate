import { Injectable } from '@angular/core';
import { VehicleService } from '../vehicles/vehicle.service';
import type { Vehicle } from '../models/vehicle.model';
import type { ScheduleItem } from '../models/schedule-item.model';

@Injectable({ providedIn: 'root' })
export class AiScheduleService {
  constructor(private readonly vehicleService: VehicleService) {}

  async generateAndSave(vehicle: Vehicle, signal?: AbortSignal): Promise<ScheduleItem[]> {
    const httpRes = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: 'gpt-oss-120b:free',
        messages: [{ role: 'user', content: this.buildPrompt(vehicle) }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!httpRes.ok) throw new Error(`AI proxy error: ${httpRes.status}`);
    const envelope = await httpRes.json();
    const parsed: { items: ScheduleItem[] } = JSON.parse(envelope.choices[0].message.content);
    if (!Array.isArray(parsed?.items)) throw new Error('AI response missing items array');
    const VALID_URGENCY = new Set(['overdue', 'due_soon', 'upcoming']);
    const filtered = parsed.items.filter(
      (i) => typeof i.source === 'string' && i.source.trim().length > 0 && VALID_URGENCY.has(i.urgency),
    );
    await this.vehicleService.updateVehicle(vehicle.id, { ai_schedule: filtered });
    return filtered;
  }

  private buildPrompt(vehicle: Vehicle): string {
    const mileageNote = vehicle.current_mileage != null
      ? `Aktualny przebieg: ${vehicle.current_mileage} km.`
      : 'Aktualny przebieg jest nieznany.';

    return `Jesteś ekspertem ds. obsługi technicznej pojazdów. Wygeneruj harmonogram przeglądów dla następującego pojazdu:

Marka: ${vehicle.make}
Model: ${vehicle.model}
Rok produkcji: ${vehicle.year}
Pojemność silnika: ${vehicle.engine_capacity}L
Rodzaj paliwa: ${vehicle.fuel_type}
${mileageNote}

Zwróć obiekt JSON z pojedynczym kluczem "items" zawierającym tablicę elementów harmonogramu przeglądów. Każdy element musi mieć dokładnie taki kształt:

{
  "item": "Wymiana oleju",
  "interval_km": 10000,
  "next_due_km": 55000,
  "next_due_date": "2025-06-01",
  "urgency": "upcoming",
  "source": "Instrukcja obsługi Toyota Corolla 2019, rozdział 7.2"
}

Zasady:
- "urgency" musi być jedną z wartości: "overdue", "due_soon", "upcoming"
- "interval_km" i "next_due_km" mogą być null, jeśli planowanie według przebiegu nie ma zastosowania
- "next_due_date" może być null, jeśli planowanie według daty nie ma zastosowania
- "source" musi być niepustym ciągiem znaków wskazującym harmonogram producenta lub standardową praktykę branżową — nigdy nie pozostawiaj go pustego
- Zwróć 8–12 elementów obejmujących najważniejsze czynności serwisowe dla tego pojazdu
- Opieraj interwały na zalecanym przez producenta harmonogramie serwisowym, jeśli jest znany, w przeciwnym razie powołaj się na standardowe praktyki branżowe`;
  }
}
