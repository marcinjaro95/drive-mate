import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, catchError, of } from 'rxjs';

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
  private readonly http = inject(HttpClient);

  decode(vin: string): Promise<VinDecodeResult> {
    return firstValueFrom(
      this.http.post<VinDecodeResult>('/api/vin', { vin }).pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) return of({ error: 'not_found' } as VinDecodeResult);
          throw new Error(`VIN decode failed: ${err.status}`);
        }),
      ),
    );
  }
}
