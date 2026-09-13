-- =============================================================================
-- LS Customs — Phase 1 Migration 1: Enum Types
-- =============================================================================
-- Creates all enum types used across the schema.
-- See DATABASE.md §1 for the exact definitions.
-- =============================================================================

create type user_role as enum ('customer', 'mechanic', 'admin');

create type rental_category as enum ('short_term', 'extended', 'premium');

create type booking_status as enum (
  'pending',      -- created, awaiting confirmation/assignment
  'confirmed',    -- rental: payment/booking confirmed
  'assigned',     -- service: mechanic assigned
  'en_route',     -- service: mechanic traveling
  'in_progress',  -- service: work underway / rental: vehicle picked up
  'completed',
  'cancelled'
);

create type service_main_category as enum (
  'routine_fluid_service',
  'tire_wheel_care',
  'electrical_battery_care',
  'diagnostic_repair',
  'lighting_visibility',
  'quick_fixes'
);

create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create type booking_type as enum ('vehicle', 'service');
