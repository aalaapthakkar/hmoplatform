/**
 * Types for the Supabase client, matching src/db/schema and the SQL migrations.
 * Once a Supabase project exists, regenerate with:
 *   npx supabase gen types typescript --project-id <ref> --schema public
 * Keep this file in step with every migration until then.
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
type RoomStatus = "available" | "let" | "unavailable" | "archived";
type TenancyStatus = "prospective" | "active" | "ending" | "ended";
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
  | "other";

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
          ownership_type: OwnershipType;
          head_rent_pence: number | null;
          tags: string[];
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
          ownership_type: OwnershipType;
          head_rent_pence?: number | null;
          tags?: string[];
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
          rent_pence: number;
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
          rent_pence: number;
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
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organisation: {
        Args: { org_name: string };
        Returns: string;
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
      room_status: RoomStatus;
      tenancy_status: TenancyStatus;
      document_type: DocumentType;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
