const chain = {
  select: () => chain, eq: () => chain, single: async () => ({ data: null, error: null }),
  maybeSingle: async () => ({ data: null, error: null }), update: () => chain,
  delete: () => chain, insert: () => chain, order: () => chain,
};
export const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'e2e' } } }) }, from: () => chain };
