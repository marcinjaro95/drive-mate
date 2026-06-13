import { Injectable } from '@angular/core';

export interface VinDecodeResult {
  make?: string;
  model?: string;
  year?: number;
  engine_capacity?: number;
  fuel_type?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class VinDecoderService {
  async decode(vin: string): Promise<VinDecodeResult> {
    const response = await fetch('/api/vin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin }),
    });
    if (!response.ok) {
      throw new Error(`VIN decode failed: ${response.status}`);
    }
    return response.json() as Promise<VinDecodeResult>;
  }
}
