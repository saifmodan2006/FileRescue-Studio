export class ApiError extends Error {
  constructor(public status: number, message: string) {super(message);}
}

export async function api<T>(path: string, options?: {method?:string; body?:unknown; csrf?:string; signal?:AbortSignal}) {
  let response: Response;
  try {
    response = await fetch('/api/' + path,{
      method:options?.method ?? 'GET', signal:options?.signal, credentials:'same-origin',
      headers:{
        ...(options?.body !== undefined && {'Content-Type':'application/json'}),
        ...(options?.csrf && {'X-CSRF-Token':options.csrf}),
      },
      body:options?.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new ApiError(503,'The local service is unavailable.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) throw new ApiError(response.status,data?.error ?? 'The local service returned an unexpected response.');
  return data as T;
}

export type PublicConfig = {feedbackEnabled:boolean; analyticsEnabled:boolean; announcement:string};
