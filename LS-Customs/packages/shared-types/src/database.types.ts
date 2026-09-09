/**
 * LS Customs — Generated Supabase Database Types
 *
 * Based on the schema migrations in apps/backend/supabase/migrations/
 * Manually maintained to match the database schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          avatar_url: string | null
          role: 'customer' | 'mechanic' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'mechanic' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'mechanic' | 'admin'
          created_at?: string
          updated_at?: string
        }
      }
      addresses: {
        Row: {
          id: string
          customer_id: string
          label: string | null
          line1: string
          city: string
          lat: number
          lng: number
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          label?: string | null
          line1: string
          city: string
          lat: number
          lng: number
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          label?: string | null
          line1?: string
          city?: string
          lat?: number
          lng?: number
          is_default?: boolean
          created_at?: string
        }
      }
      vehicles: {
        Row: {
          id: string
          category: 'short_term' | 'extended' | 'premium'
          sub_category: string
          name: string
          description: string | null
          seats: number | null
          transmission: string | null
          fuel_type: string | null
          price_per_day: number
          image_url: string | null
          gallery_urls: string[]
          location: string | null
          host_name: string | null
          host_rating: number | null
          features: string[]
          rental_rules: string[]
          mileage_policy: string | null
          max_trip: string | null
          delivery_methods: string[]
          is_active: boolean
          rating_avg: number
          rating_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category: 'short_term' | 'extended' | 'premium'
          sub_category: string
          name: string
          description?: string | null
          seats?: number | null
          transmission?: string | null
          fuel_type?: string | null
          price_per_day: number
          image_url?: string | null
          gallery_urls?: string[]
          location?: string | null
          host_name?: string | null
          host_rating?: number | null
          features?: string[]
          rental_rules?: string[]
          mileage_policy?: string | null
          max_trip?: string | null
          delivery_methods?: string[]
          is_active?: boolean
          rating_avg?: number
          rating_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: 'short_term' | 'extended' | 'premium'
          sub_category?: string
          name?: string
          description?: string | null
          seats?: number | null
          transmission?: string | null
          fuel_type?: string | null
          price_per_day?: number
          image_url?: string | null
          gallery_urls?: string[]
          location?: string | null
          host_name?: string | null
          host_rating?: number | null
          features?: string[]
          rental_rules?: string[]
          mileage_policy?: string | null
          max_trip?: string | null
          delivery_methods?: string[]
          is_active?: boolean
          rating_avg?: number
          rating_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      vehicle_bookings: {
        Row: {
          id: string
          vehicle_id: string
          customer_id: string
          start_date: string
          end_date: string
          pickup_location: string | null
          status: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
          total_price: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vehicle_id: string
          customer_id: string
          start_date: string
          end_date: string
          pickup_location?: string | null
          status?: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
          total_price: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vehicle_id?: string
          customer_id?: string
          start_date?: string
          end_date?: string
          pickup_location?: string | null
          status?: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
          total_price?: number
          created_at?: string
          updated_at?: string
        }
      }
      mechanic_profiles: {
        Row: {
          id: string
          specialties: string[] | null
          is_available: boolean
          current_lat: number | null
          current_lng: number | null
          years_experience: number | null
          rating_avg: number
          rating_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          specialties?: string[] | null
          is_available?: boolean
          current_lat?: number | null
          current_lng?: number | null
          years_experience?: number | null
          rating_avg?: number
          rating_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          specialties?: string[] | null
          is_available?: boolean
          current_lat?: number | null
          current_lng?: number | null
          years_experience?: number | null
          rating_avg?: number
          rating_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      mechanic_services: {
        Row: {
          id: string
          main_category: 'routine_fluid_service' | 'tire_wheel_care' | 'electrical_battery_care' | 'diagnostic_repair' | 'lighting_visibility' | 'quick_fixes'
          name: string
          description: string | null
          base_price: number
          estimated_duration_minutes: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          main_category: 'routine_fluid_service' | 'tire_wheel_care' | 'electrical_battery_care' | 'diagnostic_repair' | 'lighting_visibility' | 'quick_fixes'
          name: string
          description?: string | null
          base_price: number
          estimated_duration_minutes?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          main_category?: 'routine_fluid_service' | 'tire_wheel_care' | 'electrical_battery_care' | 'diagnostic_repair' | 'lighting_visibility' | 'quick_fixes'
          name?: string
          description?: string | null
          base_price?: number
          estimated_duration_minutes?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      service_bookings: {
        Row: {
          id: string
          customer_id: string
          mechanic_id: string | null
          address_id: string | null
          pin_lat: number | null
          pin_lng: number | null
          current_lat: number | null
          current_lng: number | null
          location_updated_at: string | null
          scheduled_at: string
          status: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
          total_price: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          mechanic_id?: string | null
          address_id?: string | null
          pin_lat?: number | null
          pin_lng?: number | null
          current_lat?: number | null
          current_lng?: number | null
          location_updated_at?: string | null
          scheduled_at: string
          status?: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
          total_price?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          mechanic_id?: string | null
          address_id?: string | null
          pin_lat?: number | null
          pin_lng?: number | null
          current_lat?: number | null
          current_lng?: number | null
          location_updated_at?: string | null
          scheduled_at?: string
          status?: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
          total_price?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      service_booking_items: {
        Row: {
          id: string
          service_booking_id: string
          mechanic_service_id: string
          quantity: number
          price_at_booking: number
        }
        Insert: {
          id?: string
          service_booking_id: string
          mechanic_service_id: string
          quantity?: number
          price_at_booking: number
        }
        Update: {
          id?: string
          service_booking_id?: string
          mechanic_service_id?: string
          quantity?: number
          price_at_booking?: number
        }
      }
      reviews: {
        Row: {
          id: string
          booking_type: 'vehicle' | 'service'
          booking_id: string
          customer_id: string
          target_vehicle_id: string | null
          target_mechanic_id: string | null
          rating: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_type: 'vehicle' | 'service'
          booking_id: string
          customer_id: string
          target_vehicle_id?: string | null
          target_mechanic_id?: string | null
          rating: number
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_type?: 'vehicle' | 'service'
          booking_id?: string
          customer_id?: string
          target_vehicle_id?: string | null
          target_mechanic_id?: string | null
          rating?: number
          comment?: string | null
          created_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string | null
          title: string
          body: string | null
          metadata: Json
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type?: string | null
          title: string
          body?: string | null
          metadata?: Json
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string | null
          title?: string
          body?: string | null
          metadata?: Json
          is_read?: boolean
          created_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          booking_type: 'vehicle' | 'service'
          booking_id: string
          customer_id: string
          amount: number
          currency: string
          provider: string | null
          provider_reference: string | null
          status: 'pending' | 'succeeded' | 'failed' | 'refunded'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booking_type: 'vehicle' | 'service'
          booking_id: string
          customer_id: string
          amount: number
          currency?: string
          provider?: string | null
          provider_reference?: string | null
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          booking_type?: 'vehicle' | 'service'
          booking_id?: string
          customer_id?: string
          amount?: number
          currency?: string
          provider?: string | null
          provider_reference?: string | null
          status?: 'pending' | 'succeeded' | 'failed' | 'refunded'
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_role: {
        Args: Record<PropertyKey, never>
        Returns: 'customer' | 'mechanic' | 'admin'
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_mechanic: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      get_public_mechanics: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          full_name: string
          rating_avg: number
          rating_count: number
          specialties: string[] | null
          years_experience: number | null
        }[]
      }
    }
    Enums: {
      user_role: 'customer' | 'mechanic' | 'admin'
      rental_category: 'short_term' | 'extended' | 'premium'
      booking_status: 'pending' | 'confirmed' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
      service_main_category: 'routine_fluid_service' | 'tire_wheel_care' | 'electrical_battery_care' | 'diagnostic_repair' | 'lighting_visibility' | 'quick_fixes'
      payment_status: 'pending' | 'succeeded' | 'failed' | 'refunded'
      booking_type: 'vehicle' | 'service'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience types for common queries
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Address = Database['public']['Tables']['addresses']['Row']
export type Vehicle = Database['public']['Tables']['vehicles']['Row']
export type VehicleBooking = Database['public']['Tables']['vehicle_bookings']['Row']
export type MechanicProfile = Database['public']['Tables']['mechanic_profiles']['Row']
export type MechanicService = Database['public']['Tables']['mechanic_services']['Row']
export type ServiceBooking = Database['public']['Tables']['service_bookings']['Row']
export type ServiceBookingItem = Database['public']['Tables']['service_booking_items']['Row']
export type Review = Database['public']['Tables']['reviews']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']