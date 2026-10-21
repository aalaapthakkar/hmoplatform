/**
 * Types for the Supabase client, matching src/db/schema and the SQL migrations.
 * Kept in step with every migration by hand. To regenerate instead (needs
 * `npx supabase login`):
 *   npx supabase gen types typescript --project-id <ref> --schema public
 *
 * Dates (start_date, end_date, expiry_date) are "YYYY-MM-DD" strings.
 * size_sqm is numeric, so it arrives as a string to keep it exact.
 * Business tables can't be deleted from: retire rows through status.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type OrganisationStatus = "active" | "archived";
type MembershipRole = "admin" | "staff";
type MembershipStatus = "invited" | "active" | "removed";
type AuditAction = "insert" | "update" | "delete";
type RecordStatus = "active" | "archived";
type LinkStatus = "active" | "removed";
type RentFrequency = "weekly" | "fortnightly" | "four_weekly" | "monthly";
type PropertyType = "house" | "flat" | "maisonette" | "bungalow" | "other";
type OwnershipType = "owned" | "managed" | "master_lease";
type LettingType = "house_share" | "single_let";
type RoomStatus = "available" | "let" | "unavailable" | "archived";
type TenancyStatus = "prospective" | "active" | "ending" | "ended" | "cancelled";
type TenancyEndReason = "tenant_notice" | "surrender" | "possession" | "other";
type OnboardingStepKind =
  | "application_form"
  | "right_to_rent"
  | "referencing"
  | "holding_deposit"
  | "agreement"
  | "deposit"
  | "first_rent"
  | "move_in"
  | "custom";
type OnboardingStatus = "in_progress" | "completed" | "withdrawn";
type OnboardingStepStatus = "not_started" | "in_progress" | "done" | "skipped";
type RightToRentMethod = "manual_documents" | "online_share_code" | "idsp";
type RightToRentPermission = "unlimited" | "time_limited";
type ReminderKind = "right_to_rent_follow_up" | "other";
type ReminderStatus = "open" | "done" | "dismissed";
type GuarantorStatus = "required" | "removed";
type DocumentTemplateKind = "tenancy_agreement" | "guarantor_agreement";
type SignatureRequestStatus =
  "sent" | "partly_signed" | "completed" | "declined" | "cancelled" | "error";
type SignerRole = "tenant" | "guarantor" | "organisation";
type SignerStatus = "awaiting" | "signed" | "declined";
type DocumentType =
  | "gas_safety"
  | "eicr"
  | "epc"
  | "hmo_licence"
  | "fire_risk_assessment"
  | "tenancy_agreement"
  | "right_to_rent"
  | "deposit_certificate"
  | "inventory"
  | "other"
  | "identity"
  | "proof_of_income";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13" };
  public: {
    Tables: {
      organisations: {
        Row: {
          id: string;
          name: string;
          status: OrganisationStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          status?: OrganisationStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organisations"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        // Created by a trigger on auth.users. Users may update only full_name.
        Insert: { [_ in never]: never };
        Update: { full_name?: string | null };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: MembershipRole;
          status: MembershipStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          role: MembershipRole;
          status?: MembershipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_users_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          org_id: string;
          actor_user_id: string | null;
          table_name: string;
          record_id: string;
          action: AuditAction;
          before: Json | null;
          after: Json | null;
          created_at: string;
        };
        // Written by triggers only.
        Insert: { [_ in never]: never };
        Update: { [_ in never]: never };
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      properties: {
        Row: {
          id: string;
          org_id: string;
          address_line_1: string;
          address_line_2: string | null;
          town: string;
          postcode: string;
          uprn: string | null;
          council: string | null;
          property_type: PropertyType;
          letting_type: LettingType;
          bedrooms: number | null;
          ownership_type: OwnershipType;
          head_rent_pence: number | null;
          tags: string[];
          description: string | null;
          amenities: string[];
          house_rules: string | null;
          bills_included: boolean;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          address_line_1: string;
          address_line_2?: string | null;
          town: string;
          postcode: string;
          uprn?: string | null;
          council?: string | null;
          property_type?: PropertyType;
          letting_type?: LettingType;
          bedrooms?: number | null;
          ownership_type: OwnershipType;
          head_rent_pence?: number | null;
          tags?: string[];
          description?: string | null;
          amenities?: string[];
          house_rules?: string | null;
          bills_included?: boolean;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "properties_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          id: string;
          org_id: string;
          property_id: string;
          name: string;
          rent_pence: number | null;
          rent_frequency: RentFrequency;
          size_sqm: string | null;
          features: string[];
          status: RoomStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          property_id: string;
          name: string;
          rent_pence?: number | null;
          rent_frequency?: RentFrequency;
          size_sqm?: string | null;
          features?: string[];
          status?: RoomStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "rooms_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rooms_property_fk";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      tenants: {
        Row: {
          id: string;
          org_id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "tenants_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      tenancies: {
        Row: {
          id: string;
          org_id: string;
          room_id: string;
          start_date: string;
          end_date: string | null;
          notice_date: string | null;
          end_reason: TenancyEndReason | null;
          status: TenancyStatus;
          rent_pence: number;
          rent_frequency: RentFrequency;
          rent_due_day: number;
          deposit_pence: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          room_id: string;
          start_date: string;
          end_date?: string | null;
          notice_date?: string | null;
          end_reason?: TenancyEndReason | null;
          status?: TenancyStatus;
          rent_pence: number;
          rent_frequency?: RentFrequency;
          rent_due_day?: number;
          deposit_pence?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenancies"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "tenancies_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenancies_room_fk";
            columns: ["room_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      tenancy_tenants: {
        Row: {
          id: string;
          org_id: string;
          tenancy_id: string;
          tenant_id: string;
          status: LinkStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          tenancy_id: string;
          tenant_id: string;
          status?: LinkStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenancy_tenants"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "tenancy_tenants_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenancy_tenants_tenancy_fk";
            columns: ["tenancy_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tenancies";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "tenancy_tenants_tenant_fk";
            columns: ["tenant_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      owners: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["owners"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "owners_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      property_owners: {
        Row: {
          id: string;
          org_id: string;
          property_id: string;
          owner_id: string;
          status: LinkStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          property_id: string;
          owner_id: string;
          status?: LinkStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["property_owners"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "property_owners_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_owners_property_fk";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "property_owners_owner_fk";
            columns: ["owner_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          org_id: string;
          document_type: DocumentType;
          file_path: string;
          file_name: string;
          expiry_date: string | null;
          property_id: string | null;
          room_id: string | null;
          tenancy_id: string | null;
          tenant_id: string | null;
          owner_id: string | null;
          uploaded_by: string | null;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          document_type: DocumentType;
          file_path: string;
          file_name: string;
          expiry_date?: string | null;
          property_id?: string | null;
          room_id?: string | null;
          tenancy_id?: string | null;
          tenant_id?: string | null;
          owner_id?: string | null;
          uploaded_by?: string | null;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "documents_org_id_organisations_id_fk";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_property_fk";
            columns: ["property_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "documents_room_fk";
            columns: ["room_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "documents_tenancy_fk";
            columns: ["tenancy_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tenancies";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "documents_tenant_fk";
            columns: ["tenant_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "documents_owner_fk";
            columns: ["owner_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "documents_uploaded_by_users_id_fk";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_templates: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          is_default: boolean;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          is_default?: boolean;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["onboarding_templates"]["Insert"]>;
        Relationships: [];
      };
      onboarding_template_steps: {
        Row: {
          id: string;
          org_id: string;
          template_id: string;
          position: number;
          kind: OnboardingStepKind;
          title: string;
          applicant_title: string;
          owner_is_applicant: boolean;
          due_offset_days: number;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          template_id: string;
          position: number;
          kind: OnboardingStepKind;
          title: string;
          applicant_title: string;
          owner_is_applicant?: boolean;
          due_offset_days?: number;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["onboarding_template_steps"]["Insert"]>;
        Relationships: [];
      };
      onboardings: {
        Row: {
          id: string;
          org_id: string;
          room_id: string;
          tenancy_id: string;
          template_id: string;
          status: OnboardingStatus;
          application: Json;
          application_submitted_at: string | null;
          portal_token_hash: string | null;
          portal_expires_at: string | null;
          portal_revoked_at: string | null;
          upload_key: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          room_id: string;
          tenancy_id: string;
          template_id: string;
          status?: OnboardingStatus;
          application?: Json;
          application_submitted_at?: string | null;
          portal_token_hash?: string | null;
          portal_expires_at?: string | null;
          portal_revoked_at?: string | null;
          upload_key?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["onboardings"]["Insert"]>;
        Relationships: [];
      };
      onboarding_steps: {
        Row: {
          id: string;
          org_id: string;
          onboarding_id: string;
          position: number;
          kind: OnboardingStepKind;
          title: string;
          applicant_title: string;
          status: OnboardingStepStatus;
          owner_user_id: string | null;
          owner_is_applicant: boolean;
          due_date: string | null;
          notes: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          onboarding_id: string;
          position: number;
          kind: OnboardingStepKind;
          title: string;
          applicant_title: string;
          status?: OnboardingStepStatus;
          owner_user_id?: string | null;
          owner_is_applicant?: boolean;
          due_date?: string | null;
          notes?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["onboarding_steps"]["Insert"]>;
        Relationships: [];
      };
      right_to_rent_checks: {
        Row: {
          id: string;
          org_id: string;
          tenant_id: string;
          onboarding_id: string | null;
          check_date: string;
          method: RightToRentMethod;
          permission: RightToRentPermission;
          expiry_date: string | null;
          notes: string | null;
          checked_by: string | null;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          tenant_id: string;
          onboarding_id?: string | null;
          check_date: string;
          method: RightToRentMethod;
          permission: RightToRentPermission;
          expiry_date?: string | null;
          notes?: string | null;
          checked_by?: string | null;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["right_to_rent_checks"]["Insert"]>;
        Relationships: [];
      };
      reminders: {
        Row: {
          id: string;
          org_id: string;
          kind: ReminderKind;
          title: string;
          due_date: string;
          status: ReminderStatus;
          tenant_id: string | null;
          source_id: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: ReminderKind;
          title: string;
          due_date: string;
          status?: ReminderStatus;
          tenant_id?: string | null;
          source_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reminders"]["Insert"]>;
        Relationships: [];
      };
      tenancy_guarantors: {
        Row: {
          id: string;
          org_id: string;
          tenancy_id: string;
          name: string;
          email: string;
          phone: string | null;
          address: string | null;
          status: GuarantorStatus;
          removed_at: string | null;
          removed_by: string | null;
          removed_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          tenancy_id: string;
          name: string;
          email: string;
          phone?: string | null;
          address?: string | null;
          status?: GuarantorStatus;
          removed_at?: string | null;
          removed_by?: string | null;
          removed_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenancy_guarantors"]["Insert"]>;
        Relationships: [];
      };
      document_templates: {
        Row: {
          id: string;
          org_id: string;
          kind: DocumentTemplateKind;
          name: string;
          body: string;
          is_draft: boolean;
          is_default: boolean;
          status: RecordStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: DocumentTemplateKind;
          name: string;
          body: string;
          is_draft?: boolean;
          is_default?: boolean;
          status?: RecordStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["document_templates"]["Insert"]>;
        Relationships: [];
      };
      signature_requests: {
        Row: {
          id: string;
          org_id: string;
          tenancy_id: string;
          kind: DocumentTemplateKind;
          template_id: string | null;
          guarantor_id: string | null;
          provider: string;
          provider_request_id: string;
          status: SignatureRequestStatus;
          unsigned_document_id: string | null;
          signed_document_id: string | null;
          sent_by: string | null;
          sent_at: string;
          completed_at: string | null;
          cancelled_at: string | null;
          cancelled_reason: string | null;
          last_event_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          tenancy_id: string;
          kind: DocumentTemplateKind;
          template_id?: string | null;
          guarantor_id?: string | null;
          provider: string;
          provider_request_id: string;
          status?: SignatureRequestStatus;
          unsigned_document_id?: string | null;
          signed_document_id?: string | null;
          sent_by?: string | null;
          sent_at?: string;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancelled_reason?: string | null;
          last_event_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["signature_requests"]["Insert"]>;
        Relationships: [];
      };
      signature_request_signers: {
        Row: {
          id: string;
          org_id: string;
          request_id: string;
          role: SignerRole;
          name: string;
          email: string;
          signing_order: number;
          status: SignerStatus;
          signed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          request_id: string;
          role: SignerRole;
          name: string;
          email: string;
          signing_order: number;
          status?: SignerStatus;
          signed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["signature_request_signers"]["Insert"]>;
        Relationships: [];
      };
      esign_events: {
        Row: {
          id: string;
          org_id: string;
          request_id: string;
          event_key: string;
          event_type: string;
          event_time: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          request_id: string;
          event_key: string;
          event_type: string;
          event_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["esign_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organisation: {
        Args: { org_name: string };
        Returns: string;
      };
      create_property: {
        Args: {
          p_org_id: string;
          p_address_line_1: string;
          p_address_line_2: string | null;
          p_town: string;
          p_postcode: string;
          p_council: string | null;
          p_property_type: PropertyType;
          p_letting_type: LettingType;
          p_room_count: number;
          p_room_rent_pence: number | null;
          p_ownership_type: OwnershipType;
          p_head_rent_pence: number | null;
          p_owner_id: string | null;
          p_new_owner_name: string | null;
          p_new_owner_email: string | null;
          p_new_owner_phone: string | null;
          p_tags: string[];
        };
        Returns: string;
      };
      set_property_ownership: {
        Args: {
          p_property_id: string;
          p_ownership_type: OwnershipType;
          p_head_rent_pence: number | null;
          p_owner_id: string | null;
          p_new_owner_name: string | null;
          p_new_owner_email: string | null;
          p_new_owner_phone: string | null;
        };
        Returns: undefined;
      };
      create_tenancy: {
        Args: {
          p_room_id: string;
          p_first_name: string;
          p_last_name: string;
          p_email: string | null;
          p_phone: string | null;
          p_start_date: string;
          p_rent_pence: number;
          p_rent_frequency: RentFrequency;
          p_rent_due_day: number;
          p_deposit_pence: number;
        };
        Returns: string;
      };
      give_tenancy_notice: {
        Args: {
          p_tenancy_id: string;
          p_end_reason: TenancyEndReason;
          p_notice_date: string;
          p_end_date: string;
        };
        Returns: undefined;
      };
      end_tenancy: { Args: { p_tenancy_id: string }; Returns: undefined };
      start_tenancy: { Args: { p_tenancy_id: string }; Returns: undefined };
      cancel_tenancy: { Args: { p_tenancy_id: string }; Returns: undefined };
      start_onboarding: { Args: { p_tenancy_id: string }; Returns: string };
      update_onboarding_step: {
        Args: {
          p_step_id: string;
          p_status: OnboardingStepStatus;
          p_owner_user_id: string | null;
          p_owner_is_applicant: boolean;
          p_due_date: string | null;
          p_notes: string | null;
        };
        Returns: undefined;
      };
      set_portal_link: { Args: { p_onboarding_id: string; p_token_hash: string }; Returns: string };
      revoke_portal_link: { Args: { p_onboarding_id: string }; Returns: undefined };
      record_right_to_rent: {
        Args: {
          p_tenant_id: string;
          p_onboarding_id: string | null;
          p_check_date: string;
          p_method: RightToRentMethod;
          p_permission: RightToRentPermission;
          p_expiry_date: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      change_move_in_date: {
        Args: { p_tenancy_id: string; p_start_date: string };
        Returns: undefined;
      };
      withdraw_onboarding: { Args: { p_onboarding_id: string }; Returns: undefined };
      org_people: { Args: { p_org_id: string }; Returns: { id: string; name: string }[] };
      portal_overview: { Args: { p_token: string }; Returns: Json };
      portal_save_application: {
        Args: { p_token: string; p_application: Json; p_submit: boolean };
        Returns: undefined;
      };
      portal_record_document: {
        Args: {
          p_token: string;
          p_path: string;
          p_file_name: string;
          p_document_type: DocumentType;
        };
        Returns: undefined;
      };
      add_guarantor: {
        Args: {
          p_tenancy_id: string;
          p_name: string;
          p_email: string;
          p_phone: string | null;
          p_address: string | null;
        };
        Returns: string;
      };
      remove_guarantor: { Args: { p_guarantor_id: string; p_reason: string }; Returns: undefined };
      record_signature_request: {
        Args: {
          p_tenancy_id: string;
          p_kind: DocumentTemplateKind;
          p_template_id: string | null;
          p_guarantor_id: string | null;
          p_provider: string;
          p_provider_request_id: string;
          p_unsigned_document_id: string | null;
          p_signers: Json;
        };
        Returns: string;
      };
      attach_signed_document: {
        Args: { p_request_id: string; p_document_id: string };
        Returns: undefined;
      };
      esign_apply_event: {
        Args: {
          p_relay_secret: string;
          p_provider: string;
          p_provider_request_id: string;
          p_event_key: string;
          p_event_type: string;
          p_event_time: string | null;
          p_request_status: SignatureRequestStatus;
          p_signers: Json;
        };
        Returns: string;
      };
      property_activity: {
        Args: { p_property_id: string; p_limit?: number };
        Returns: {
          id: string;
          table_name: string;
          record_id: string;
          action: AuditAction;
          before: Json | null;
          after: Json | null;
          created_at: string;
          actor_user_id: string | null;
          actor_name: string | null;
        }[];
      };
    };
    Enums: {
      organisation_status: OrganisationStatus;
      membership_role: MembershipRole;
      membership_status: MembershipStatus;
      audit_action: AuditAction;
      record_status: RecordStatus;
      link_status: LinkStatus;
      rent_frequency: RentFrequency;
      property_type: PropertyType;
      ownership_type: OwnershipType;
      letting_type: LettingType;
      room_status: RoomStatus;
      tenancy_status: TenancyStatus;
      tenancy_end_reason: TenancyEndReason;
      onboarding_step_kind: OnboardingStepKind;
      onboarding_status: OnboardingStatus;
      onboarding_step_status: OnboardingStepStatus;
      right_to_rent_method: RightToRentMethod;
      right_to_rent_permission: RightToRentPermission;
      reminder_kind: ReminderKind;
      reminder_status: ReminderStatus;
      guarantor_status: GuarantorStatus;
      document_template_kind: DocumentTemplateKind;
      signature_request_status: SignatureRequestStatus;
      signer_role: SignerRole;
      signer_status: SignerStatus;
      document_type: DocumentType;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
