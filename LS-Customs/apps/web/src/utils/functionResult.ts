/** Supabase invoke can resolve with an error instead of rejecting its promise. */
export function requireFunctionData<T>(result: { data: { data?: T; error?: { message?: string } } | null; error: unknown }, fallback: string): T {
  if (result.error || result.data?.error) throw new Error(result.data?.error?.message || fallback)
  if (result.data?.data == null) throw new Error(fallback)
  return result.data.data
}
