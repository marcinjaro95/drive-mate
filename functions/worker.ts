const ALLOWED_ORIGINS = new Set([
  'https://drive-mate.marcinjaro95.workers.dev',
  'http://localhost:4200',
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin':
      origin && ALLOWED_ORIGINS.has(origin)
        ? origin
        : 'https://drive-mate.marcinjaro95.workers.dev',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

interface Fetcher {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

interface Env {
  ASSETS: Fetcher;
  OPENROUTER_API_KEY: string;
  AUTOREF_API_KEY: string;
}

interface VinDecodeResult {
  make?: string;
  model?: string;
  year?: number;
  engine_capacity?: number;
  fuel_type?: string;
  error?: string;
}

function normalizeFuel(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  if (s === 'electric') return 'electric';
  if (s === 'diesel') return 'diesel';
  if (['gasoline', 'petrol', 'essence', 'benzin'].includes(s)) return 'gasoline';
  if (['hybrid', 'hybride'].includes(s)) return 'hybrid';
  if (['lpg', 'gpl', 'liquefied petroleum gas'].includes(s)) return 'lpg';
  return undefined;
}

async function tryAutoRef(vin: string, apiKey: string): Promise<VinDecodeResult | null> {
  let resp: Response;
  try {
    resp = await fetch(`https://api.autoref.eu/v1/vin/${vin}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    return null;
  }

  if (resp.status === 404) return null;
  if (!resp.ok) {
    console.warn('AutoRef non-OK:', resp.status, vin);
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  const vinInfo = data['VIN_INFO'] as Record<string, unknown> | undefined;
  if (!vinInfo) return null;

  const brand = vinInfo['BRAND'] as string | undefined;
  const model = vinInfo['MODEL'] as string | undefined;
  const fuelRaw = vinInfo['FUEL'] as string | undefined;

  const specs = data['SPECS'] as Record<string, unknown> | undefined;
  const dateStart = specs?.['DATE_REGISTRAR_START'] as string | undefined;
  const year = dateStart ? new Date(dateStart).getFullYear() : undefined;

  // cm³ → litres; try both likely field names
  const displacementCm3 =
    (vinInfo['DISPLACEMENT'] as number | undefined) ??
    (vinInfo['CUBIC_CAPACITY'] as number | undefined);
  const engineCapacity = displacementCm3 ? displacementCm3 / 1000 : undefined;

  const result: VinDecodeResult = {};
  if (brand) result.make = brand;
  if (model) result.model = model;
  if (year && !isNaN(year)) result.year = year;
  if (engineCapacity) result.engine_capacity = engineCapacity;
  const fuel = normalizeFuel(fuelRaw);
  if (fuel) result.fuel_type = fuel;

  if (!result.make && !result.model && !result.year) return null;
  return result;
}

async function tryNhtsa(vin: string): Promise<VinDecodeResult | null> {
  let resp: Response;
  try {
    resp = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`);
  } catch {
    return null;
  }

  if (!resp.ok) return null;

  let data: { Results?: { Variable: string; Value: string | null }[] };
  try {
    data = await resp.json();
  } catch {
    return null;
  }

  const results = data.Results ?? [];
  const find = (name: string) => results.find((r) => r.Variable === name)?.Value ?? null;

  const make = find('Make');
  const model = find('Model');
  const yearStr = find('Model Year');
  const dispStr = find('Displacement (L)');
  const fuelRaw = find('Fuel Type - Primary');

  if (!make && !model) return null;

  const result: VinDecodeResult = {};
  if (make) result.make = make;
  if (model) result.model = model;
  const year = yearStr ? parseInt(yearStr, 10) : NaN;
  if (!isNaN(year)) result.year = year;
  const engineCapacity = dispStr ? parseFloat(dispStr) : NaN;
  if (!isNaN(engineCapacity)) result.engine_capacity = engineCapacity;
  const fuel = normalizeFuel(fuelRaw);
  if (fuel) result.fuel_type = fuel;

  return result;
}

async function handleVin(request: Request, env: Env): Promise<Response> {
  if (!env.AUTOREF_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }

  let body: { vin?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }

  const vin = body.vin?.trim().toUpperCase() ?? '';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return new Response(JSON.stringify({ error: 'invalid_vin' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }

  const autoRefResult = await tryAutoRef(vin, env.AUTOREF_API_KEY);
  if (autoRefResult) {
    return new Response(JSON.stringify(autoRefResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }

  const nhtsaResult = await tryNhtsa(vin);
  if (nhtsaResult) {
    return new Response(JSON.stringify(nhtsaResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }

  return new Response(JSON.stringify({ error: 'not_found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

async function handleAI(request: Request, env: Env): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://drive-mate.workers.dev',
      'X-Title': 'DriveMate',
    },
    body: JSON.stringify(body),
  });

  return new Response(upstream.body ?? new ReadableStream(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      ...corsHeaders(request),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method === 'POST') {
        return handleAI(request, env);
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (url.pathname === '/api/vin') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method === 'POST') {
        return handleVin(request, env);
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};
