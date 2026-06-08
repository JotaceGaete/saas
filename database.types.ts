export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ad_images: {
        Row: {
          ad_id: string
          alt_text: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          sort_order: number | null
          storage_path: string
        }
        Insert: {
          ad_id: string
          alt_text?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          sort_order?: number | null
          storage_path: string
        }
        Update: {
          ad_id?: string
          alt_text?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          sort_order?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_images_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "classified_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_messages: {
        Row: {
          ad_id: string
          body: string
          created_at: string | null
          id: string
          is_read: boolean | null
          parent_id: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          ad_id: string
          body: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          parent_id?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          ad_id?: string
          body?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          parent_id?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_messages_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "classified_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ad_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          image_url: string | null
          link_url: string | null
          position: string
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          position?: string
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          position?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      business_claims: {
        Row: {
          business_id: string
          claim_status: Database["public"]["Enums"]["claim_status"] | null
          claimant_email: string
          claimant_name: string
          claimant_phone: string | null
          claimant_role: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          claim_status?: Database["public"]["Enums"]["claim_status"] | null
          claimant_email: string
          claimant_name: string
          claimant_phone?: string | null
          claimant_role?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          claim_status?: Database["public"]["Enums"]["claim_status"] | null
          claimant_email?: string
          claimant_name?: string
          claimant_phone?: string | null
          claimant_role?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_claims_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_images: {
        Row: {
          alt_text: string | null
          business_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          sort_order: number | null
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          sort_order?: number | null
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          sort_order?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_images_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_reviews: {
        Row: {
          business_id: string
          comment: string
          created_at: string | null
          id: string
          owner_replied_at: string | null
          owner_reply: string | null
          rating: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          comment: string
          created_at?: string | null
          id?: string
          owner_replied_at?: string | null
          owner_reply?: string | null
          rating: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          comment?: string
          created_at?: string | null
          id?: string
          owner_replied_at?: string | null
          owner_reply?: string | null
          rating?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          address_text: string | null
          category: string
          category_id: string | null
          category_key: string | null
          claimed: boolean | null
          contacts_count: number | null
          created_at: string | null
          description: string | null
          email: string | null
          featured: boolean | null
          id: string
          is_open: boolean | null
          lat: number | null
          latitude: number | null
          lng: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          opening_hours: Json | null
          owner_id: string | null
          phone: string | null
          premium_until: string | null
          profile_visits: number | null
          rating: number | null
          redes_sociales: string | null
          rejection_reason: string | null
          review_count: number | null
          social_links: Json | null
          status: string | null
          updated_at: string | null
          verified: boolean | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          address_text?: string | null
          category: string
          category_id?: string | null
          category_key?: string | null
          claimed?: boolean | null
          contacts_count?: number | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          featured?: boolean | null
          id?: string
          is_open?: boolean | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          premium_until?: string | null
          profile_visits?: number | null
          rating?: number | null
          redes_sociales?: string | null
          rejection_reason?: string | null
          review_count?: number | null
          social_links?: Json | null
          status?: string | null
          updated_at?: string | null
          verified?: boolean | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          address_text?: string | null
          category?: string
          category_id?: string | null
          category_key?: string | null
          claimed?: boolean | null
          contacts_count?: number | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          featured?: boolean | null
          id?: string
          is_open?: boolean | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          premium_until?: string | null
          profile_visits?: number | null
          rating?: number | null
          redes_sociales?: string | null
          rejection_reason?: string | null
          review_count?: number | null
          social_links?: Json | null
          status?: string | null
          updated_at?: string | null
          verified?: boolean | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_count: number | null
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          name_key: string
          parent_id: string | null
          sort_order: number | null
        }
        Insert: {
          business_count?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          name_key: string
          parent_id?: string | null
          sort_order?: number | null
        }
        Update: {
          business_count?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_key?: string
          parent_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      church_details: {
        Row: {
          business_id: string
          id: string
          pastor_name: string | null
          service_schedule: string | null
          updated_at: string | null
          weekly_message: string | null
        }
        Insert: {
          business_id: string
          id?: string
          pastor_name?: string | null
          service_schedule?: string | null
          updated_at?: string | null
          weekly_message?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          pastor_name?: string | null
          service_schedule?: string | null
          updated_at?: string | null
          weekly_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_details_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      classified_ads: {
        Row: {
          ad_status: Database["public"]["Enums"]["ad_status"] | null
          category: string
          category_key: string | null
          condition: string | null
          created_at: string | null
          description: string | null
          duration_days: number | null
          expires_at: string | null
          featured: boolean | null
          guest_email: string | null
          id: string
          ip_address: string | null
          location: string | null
          phone: string | null
          price: number | null
          price_negotiable: boolean | null
          title: string
          updated_at: string | null
          user_id: string | null
          verification_token: string | null
          verified_at: string | null
          views: number | null
          whatsapp: boolean | null
        }
        Insert: {
          ad_status?: Database["public"]["Enums"]["ad_status"] | null
          category: string
          category_key?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          expires_at?: string | null
          featured?: boolean | null
          guest_email?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          phone?: string | null
          price?: number | null
          price_negotiable?: boolean | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          verification_token?: string | null
          verified_at?: string | null
          views?: number | null
          whatsapp?: boolean | null
        }
        Update: {
          ad_status?: Database["public"]["Enums"]["ad_status"] | null
          category?: string
          category_key?: string | null
          condition?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          expires_at?: string | null
          featured?: boolean | null
          guest_email?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          phone?: string | null
          price?: number | null
          price_negotiable?: boolean | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          verification_token?: string | null
          verified_at?: string | null
          views?: number | null
          whatsapp?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "classified_ads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          body: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          sector: string
          status: Database["public"]["Enums"]["community_post_status"]
          title: string
          upvote_count: number
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          sector: string
          status?: Database["public"]["Enums"]["community_post_status"]
          title: string
          upvote_count?: number
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          sector?: string
          status?: Database["public"]["Enums"]["community_post_status"]
          title?: string
          upvote_count?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_question_images: {
        Row: {
          created_at: string
          id: string
          public_url: string
          question_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          public_url: string
          question_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          public_url?: string
          question_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_question_images_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          linked_business_id: string | null
          post_id: string
          status: Database["public"]["Enums"]["community_reply_status"]
          upvote_count: number
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          linked_business_id?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["community_reply_status"]
          upvote_count?: number
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          linked_business_id?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["community_reply_status"]
          upvote_count?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_replies_linked_business_id_fkey"
            columns: ["linked_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_votes: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["community_vote_target"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["community_vote_target"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["community_vote_target"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_post_tracking: {
        Row: {
          created_at: string | null
          id: string
          identifier: string
          identifier_type: string
          last_post_at: string | null
          post_count: number | null
          post_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          identifier: string
          identifier_type: string
          last_post_at?: string | null
          post_count?: number | null
          post_date?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          identifier?: string
          identifier_type?: string
          last_post_at?: string | null
          post_count?: number | null
          post_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          address: string | null
          address_text: string | null
          category: string
          contact_whatsapp: string | null
          created_at: string | null
          description: string | null
          end_datetime: string
          id: string
          image_url: string | null
          is_featured: boolean | null
          lat: number | null
          lng: number | null
          organizer_business_id: string | null
          start_datetime: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string | null
          user_id: string | null
          venue_name: string | null
        }
        Insert: {
          address?: string | null
          address_text?: string | null
          category?: string
          contact_whatsapp?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime: string
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          lat?: number | null
          lng?: number | null
          organizer_business_id?: string | null
          start_datetime: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string | null
          user_id?: string | null
          venue_name?: string | null
        }
        Update: {
          address?: string | null
          address_text?: string | null
          category?: string
          contact_whatsapp?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime?: string
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          lat?: number | null
          lng?: number | null
          organizer_business_id?: string | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string | null
          user_id?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organizer_business_id_fkey"
            columns: ["organizer_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_listings: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          listing_id: string
          listing_type: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          listing_id: string
          listing_type: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          listing_id?: string
          listing_type?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          carta_presentacion: string | null
          created_at: string
          cv_url: string | null
          email: string
          id: string
          job_id: string
          nombre_completo: string
          status: Database["public"]["Enums"]["job_application_status"]
          telefono: string | null
        }
        Insert: {
          carta_presentacion?: string | null
          created_at?: string
          cv_url?: string | null
          email: string
          id?: string
          job_id: string
          nombre_completo: string
          status?: Database["public"]["Enums"]["job_application_status"]
          telefono?: string | null
        }
        Update: {
          carta_presentacion?: string | null
          created_at?: string
          cv_url?: string | null
          email?: string
          id?: string
          job_id?: string
          nombre_completo?: string
          status?: Database["public"]["Enums"]["job_application_status"]
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          business_id: string | null
          category: string
          company: string
          created_at: string
          description: string
          email_contact: string
          expires_at: string
          id: string
          location: string
          logo_url: string | null
          modality: string
          requirements: string | null
          salary_max: number | null
          salary_min: number | null
          slug: string
          status: Database["public"]["Enums"]["job_status"]
          title: string
          type: string
          user_id: string | null
          whatsapp_contact: string | null
        }
        Insert: {
          business_id?: string | null
          category?: string
          company: string
          created_at?: string
          description: string
          email_contact: string
          expires_at?: string
          id?: string
          location: string
          logo_url?: string | null
          modality?: string
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          slug: string
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          type?: string
          user_id?: string | null
          whatsapp_contact?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string
          company?: string
          created_at?: string
          description?: string
          email_contact?: string
          expires_at?: string
          id?: string
          location?: string
          logo_url?: string | null
          modality?: string
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          type?: string
          user_id?: string | null
          whatsapp_contact?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_files: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          mime_type: string | null
          owner_id: string | null
          size: number | null
          storage_key: string
          url: string
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          mime_type?: string | null
          owner_id?: string | null
          size?: number | null
          storage_key: string
          url: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          mime_type?: string | null
          owner_id?: string | null
          size?: number | null
          storage_key?: string
          url?: string
        }
        Relationships: []
      }
      popups: {
        Row: {
          active: boolean | null
          button_link: string | null
          button_text: string | null
          created_at: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          message: string | null
          starts_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          message?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          message?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      suggested_businesses: {
        Row: {
          address: string | null
          admin_notes: string | null
          business_name: string
          category: string
          created_at: string
          id: string
          phone: string | null
          reply_id: string | null
          status: Database["public"]["Enums"]["suggested_business_status"]
          suggested_by: string | null
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          business_name: string
          category: string
          created_at?: string
          id?: string
          phone?: string | null
          reply_id?: string | null
          status?: Database["public"]["Enums"]["suggested_business_status"]
          suggested_by?: string | null
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          business_name?: string
          category?: string
          created_at?: string
          id?: string
          phone?: string | null
          reply_id?: string | null
          status?: Database["public"]["Enums"]["suggested_business_status"]
          suggested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggested_businesses_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "community_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_businesses_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          email_notifications: boolean | null
          full_name: string
          id: string
          location: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          email_notifications?: boolean | null
          full_name?: string
          id: string
          location?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          email_notifications?: boolean | null
          full_name?: string
          id?: string
          location?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wa_admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      wa_admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          payload: Json | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      wa_businesses: {
        Row: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_account_type: string | null
          bank_email: string | null
          bank_name: string | null
          bank_rut: string | null
          city: string | null
          country: string | null
          cover_image_url: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          design_settings: Json | null
          email: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          order_message_template: string | null
          plan_expires_at: string | null
          plan_slug: string
          print_legend: string | null
          rubro_id: string | null
          scheduled_change_at: string | null
          scheduled_plan_slug: string | null
          slug: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp: string
        }
        Insert: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_email?: string | null
          bank_name?: string | null
          bank_rut?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          design_settings?: Json | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          order_message_template?: string | null
          plan_expires_at?: string | null
          plan_slug?: string
          print_legend?: string | null
          rubro_id?: string | null
          scheduled_change_at?: string | null
          scheduled_plan_slug?: string | null
          slug?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp: string
        }
        Update: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_email?: string | null
          bank_name?: string | null
          bank_rut?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          design_settings?: Json | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          order_message_template?: string | null
          plan_expires_at?: string | null
          plan_slug?: string
          print_legend?: string | null
          rubro_id?: string | null
          scheduled_change_at?: string | null
          scheduled_plan_slug?: string | null
          slug?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_businesses_rubro_id_fkey"
            columns: ["rubro_id"]
            isOneToOne: false
            referencedRelation: "wa_rubros"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_catalog_visits: {
        Row: {
          business_id: string
          created_at: string
          id: string
          path: string | null
          referrer: string | null
          slug: string
          user_agent: string | null
          visitor_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          path?: string | null
          referrer?: string | null
          slug: string
          user_agent?: string | null
          visitor_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          path?: string | null
          referrer?: string | null
          slug?: string
          user_agent?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_catalog_visits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_catalog_visits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_payments_admin_view"
            referencedColumns: ["business_id"]
          },
        ]
      }
      wa_order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string | null
          product_id: string | null
          product_name: string
          product_price: number
          quantity: number
          selected_options: Json | null
          subtotal: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          product_name: string
          product_price: number
          quantity?: number
          selected_options?: Json | null
          subtotal: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          product_name?: string
          product_price?: number
          quantity?: number
          selected_options?: Json | null
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "wa_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wa_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wa_products"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_orders: {
        Row: {
          business_id: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          order_status: string | null
          paid_at: string | null
          payment_status: string | null
          subtotal: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_status?: string | null
          paid_at?: string | null
          payment_status?: string | null
          subtotal?: number | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_status?: string | null
          paid_at?: string | null
          payment_status?: string | null
          subtotal?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_payments_admin_view"
            referencedColumns: ["business_id"]
          },
        ]
      }
      wa_payment_events: {
        Row: {
          event_type: string
          id: string
          mp_payment_id: string
          mp_status: string | null
          payment_id: string | null
          processed_at: string
          raw_payload: Json | null
        }
        Insert: {
          event_type?: string
          id?: string
          mp_payment_id: string
          mp_status?: string | null
          payment_id?: string | null
          processed_at?: string
          raw_payload?: Json | null
        }
        Update: {
          event_type?: string
          id?: string
          mp_payment_id?: string
          mp_status?: string | null
          payment_id?: string | null
          processed_at?: string
          raw_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "wa_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "wa_payments_admin_view"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          currency: string
          external_reference: string
          id: string
          metadata: Json | null
          mp_payment_id: string | null
          mp_payment_method: string | null
          mp_payment_type: string | null
          mp_preference_id: string | null
          mp_status: string | null
          mp_status_detail: string | null
          plan_activated_at: string | null
          plan_expires_at: string | null
          plan_slug: string
          raw_mp_response: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          currency?: string
          external_reference: string
          id?: string
          metadata?: Json | null
          mp_payment_id?: string | null
          mp_payment_method?: string | null
          mp_payment_type?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          mp_status_detail?: string | null
          plan_activated_at?: string | null
          plan_expires_at?: string | null
          plan_slug: string
          raw_mp_response?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          currency?: string
          external_reference?: string
          id?: string
          metadata?: Json | null
          mp_payment_id?: string | null
          mp_payment_method?: string | null
          mp_payment_type?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          mp_status_detail?: string | null
          plan_activated_at?: string | null
          plan_expires_at?: string | null
          plan_slug?: string
          raw_mp_response?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_payments_admin_view"
            referencedColumns: ["business_id"]
          },
        ]
      }
      wa_products: {
        Row: {
          business_id: string | null
          category: string | null
          created_at: string | null
          description: string | null
          has_options: boolean
          id: string
          image_url: string | null
          images: Json | null
          is_active: boolean | null
          name: string
          options_description: string | null
          price: number
          show_price: boolean
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          has_options?: boolean
          id?: string
          image_url?: string | null
          images?: Json | null
          is_active?: boolean | null
          name: string
          options_description?: string | null
          price: number
          show_price?: boolean
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          has_options?: boolean
          id?: string
          image_url?: string | null
          images?: Json | null
          is_active?: boolean | null
          name?: string
          options_description?: string | null
          price?: number
          show_price?: boolean
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "wa_payments_admin_view"
            referencedColumns: ["business_id"]
          },
        ]
      }
      wa_rubro_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          rubro_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          rubro_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          rubro_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_rubro_categories_rubro_id_fkey"
            columns: ["rubro_id"]
            isOneToOne: false
            referencedRelation: "wa_rubros"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_rubros: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      wa_payments_admin_view: {
        Row: {
          amount: number | null
          business_id: string | null
          business_name: string | null
          business_plan_expires_at: string | null
          business_plan_slug: string | null
          business_slug: string | null
          created_at: string | null
          currency: string | null
          external_reference: string | null
          id: string | null
          metadata: Json | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          mp_status: string | null
          mp_status_detail: string | null
          origin: string | null
          plan_activated_at: string | null
          plan_expires_at: string | null
          plan_slug: string | null
          status: string | null
          updated_at: string | null
          user_email: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_daily_post_limit:
        | {
            Args: { p_identifier: string; p_identifier_type: string }
            Returns: boolean
          }
        | {
            Args: {
              p_identifier: string
              p_identifier_type: string
              p_user_id?: string
            }
            Returns: boolean
          }
      check_daily_review_limit: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_job_expiry: { Args: never; Returns: undefined }
      check_post_cooldown: { Args: { p_ip: string }; Returns: boolean }
      check_premium_expiry: { Args: never; Returns: undefined }
      has_approved_claim: { Args: { p_business_id: string }; Returns: boolean }
      increment_daily_post_count: {
        Args: { p_identifier: string; p_identifier_type: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_jobs: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      verify_ad_by_token: { Args: { p_token: string }; Returns: Json }
      wa_admin_change_plan: {
        Args: {
          p_business_id: string
          p_new_plan_slug: string
          p_reason?: string
        }
        Returns: Json
      }
      wa_admin_extend_plan: {
        Args: { p_business_id: string; p_days: number; p_reason?: string }
        Returns: Json
      }
      wa_admin_notify: {
        Args: {
          p_body?: string
          p_payload?: Json
          p_title: string
          p_type: string
        }
        Returns: string
      }
      wa_admin_payments_stats: {
        Args: { p_month_end?: string; p_month_start?: string }
        Returns: Json
      }
      wa_admin_plans_sold: {
        Args: never
        Returns: {
          count: number
          plan_slug: string
        }[]
      }
      wa_apply_scheduled_plan_changes: {
        Args: never
        Returns: {
          business_id: string
          new_plan: string
          previous_plan: string
        }[]
      }
      wa_get_business_visit_stats: {
        Args: { p_business_id: string }
        Returns: Json
      }
      wa_is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      ad_status: "active" | "expired" | "draft" | "deleted" | "pending"
      claim_status: "pending" | "approved" | "rejected"
      community_post_status: "pending" | "active" | "rejected"
      community_reply_status: "active" | "hidden"
      community_vote_target: "post" | "reply"
      event_status: "pending" | "approved" | "rejected" | "active"
      job_application_status: "pending" | "reviewed" | "rejected"
      job_status: "pending" | "published" | "expired"
      suggested_business_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ad_status: ["active", "expired", "draft", "deleted", "pending"],
      claim_status: ["pending", "approved", "rejected"],
      community_post_status: ["pending", "active", "rejected"],
      community_reply_status: ["active", "hidden"],
      community_vote_target: ["post", "reply"],
      event_status: ["pending", "approved", "rejected", "active"],
      job_application_status: ["pending", "reviewed", "rejected"],
      job_status: ["pending", "published", "expired"],
      suggested_business_status: ["pending", "approved", "rejected"],
    },
  },
} as const
