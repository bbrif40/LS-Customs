/**
 * LS Customs — Shared TypeScript Types
 *
 * Single source of truth for database types and hand-written domain types.
 * Generated from the Supabase schema via:
 *   supabase gen types typescript --linked > packages/shared-types/src/database.types.ts
 *
 * Consumed by apps/backend (Edge Functions) and later by apps/web (Ionic frontend).
 */

// Re-export generated database types
export * from './database.types';

// Re-export hand-written domain types
export * from './domain.types';
