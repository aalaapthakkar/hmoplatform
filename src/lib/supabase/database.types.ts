/**
 * Types for the Supabase client, matching src/db/schema and the SQL migrations.
 * Once a Supabase project exists, regenerate with:
 *   npx supabase gen types typescript --project-id <ref> --schema public
 * Keep this file in step with every migration until then.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type OrganisationStatus = "active" | "archived";
type MembershipRole =
  "org_admin" | "staff" | "applicant" | "tenant" | "guarantor" | "owner" | "supplier";
type MembershipStatus = "invited" | "active" | "removed";
type AuditAction = "insert" | "update" | "delete";

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
    };
    CompositeTypes: { [_ in never]: never };
  };
};
