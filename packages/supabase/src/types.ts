/**
 * ЗГЕНЕРУЙТЕ ЦЕЙ ФАЙЛ, не редагуйте вручну:
 *   pnpm db:types
 * (запускає `supabase gen types typescript --local` після supabase db reset)
 *
 * Нижче — тимчасова заглушка, щоб проєкт збирався до першого запуску Supabase локально.
 */
export type Database = {
  public: {
    Tables: Record<string, { Row: any; Insert: any; Update: any }>;
  };
};
