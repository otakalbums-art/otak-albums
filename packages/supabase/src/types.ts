/**
 * Написано вручну на основі supabase/migrations/0001..0011 — не було
 * можливості прогнати `supabase gen types typescript --project-id ...`
 * (немає ні пароля прямого підключення до БД, ні Supabase access token,
 * ні браузера для `supabase login` в цьому середовищі). Раніше тут була
 * заглушка `Record<string, {Row:any,...}>`, з якою `next dev` працював
 * (dev-режим не падає на помилках типів), але справжній `next build`
 * (те, що ганяє Vercel) падав з "Property X does not exist on type
 * 'never'" на кожному .select() — узагальнений Record-тип ламає
 * внутрішній generic-ланцюжок supabase-js, який виводить Row за
 * буквальною назвою таблиці.
 *
 * Якщо схема зміниться — онови цей файл вручну (або прожени
 * `pnpm db:types`, якщо колись з'явиться доступ до `supabase login`/
 * прямого підключення — команда вже є в package.json, просто зараз
 * непридатна в цьому середовищі).
 *
 * `__InternalSupabase` — службове поле, яке з певної версії додає сам
 * генератор Supabase; новіші @supabase/ssr/@supabase/supabase-js (тут:
 * 2.112.x) вимагають його в типі Database для коректного виведення
 * SchemaName-дженеріка — без нього весь ланцюжок виведення типів
 * ламається так само, як зі старою заглушкою (усе стає 'never').
 * PostgrestVersion лише вмикає/вимикає пару нішевих фіч типізації
 * (spread-embed у .select(), maxAffected) — код їх не використовує,
 * конкретне значення не критичне.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Enum-подібні текстові колонки з check-обмеженням у БД — літеральні union
// замість голого string, інакше компоненти, які звужують за конкретними
// значеннями (напр. SlotsEditor за kind: "photo"|"text"), не приймають Row.
type ClassStatus = "pending" | "active" | "archived";
type PhotoFileType =
  | "jpeg"
  | "cr2"
  | "cr3"
  | "nef"
  | "nrw"
  | "arw"
  | "sr2"
  | "raf"
  | "orf"
  | "rw2"
  | "pef"
  | "srw"
  | "x3f"
  | "dng";
type PhotoCategory = "portrait" | "group" | "ceremony" | "personal" | "uncategorized";
type PhotoFileKind = "jpeg" | "raw";
type OrderStatus = "not_ordered" | "ordered" | "partially_paid" | "paid" | "free";
type SlotKind = "photo" | "text";
type SlotFilledBy = "admin" | "student";

// Relationships — реальні FK з migrations/*.sql, потрібні postgrest-js, щоб
// правильно вивести тип для embedded-select'ів (напр. .select("*, classes(name)")) —
// порожній масив ламає лише ЦЕ (SelectQueryError), не базові Row/Insert/Update,
// тому виявилось не одразу. foreignKeyName — за стандартною postgres-конвенцією
// {таблиця}_{колонка}_fkey (жодного разу не задавались вручну в жодній міграції).

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: string;
  };
  public: {
    Tables: {
      schools: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      album_types: {
        Row: {
          id: string;
          name: string;
          page_count: number | null;
          folder_template: Json;
          created_at: string;
          price: number | null;
          cost_price: number | null;
        };
        Insert: {
          id?: string;
          name: string;
          page_count?: number | null;
          folder_template?: Json;
          created_at?: string;
          price?: number | null;
          cost_price?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          page_count?: number | null;
          folder_template?: Json;
          created_at?: string;
          price?: number | null;
          cost_price?: number | null;
        };
        Relationships: [];
      };
      classes: {
        Row: {
          id: string;
          school_id: string;
          album_type_id: string | null;
          name: string;
          referral_code: string;
          status: ClassStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          album_type_id?: string | null;
          name: string;
          referral_code: string;
          status?: ClassStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          album_type_id?: string | null;
          name?: string;
          referral_code?: string;
          status?: ClassStatus;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "classes_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "classes_album_type_id_fkey"; columns: ["album_type_id"]; isOneToOne: false; referencedRelation: "album_types"; referencedColumns: ["id"] }
        ];
      };
      students: {
        Row: {
          id: string;
          class_id: string;
          first_name: string;
          last_name: string;
          session_token: string | null;
          session_expires_at: string | null;
          created_at: string;
          is_staff: boolean;
          order_status: OrderStatus;
          order_amount: number | null;
          ordered_at: string | null;
          paid_at: string | null;
          paid_amount: number;
          staff_role: string | null;
          selection_confirmed_at: string | null;
          first_login_at: string | null;
        };
        Insert: {
          id?: string;
          class_id: string;
          first_name: string;
          last_name: string;
          session_token?: string | null;
          session_expires_at?: string | null;
          created_at?: string;
          is_staff?: boolean;
          order_status?: OrderStatus;
          order_amount?: number | null;
          ordered_at?: string | null;
          paid_at?: string | null;
          paid_amount?: number;
          staff_role?: string | null;
          selection_confirmed_at?: string | null;
          first_login_at?: string | null;
        };
        Update: {
          id?: string;
          class_id?: string;
          first_name?: string;
          last_name?: string;
          session_token?: string | null;
          session_expires_at?: string | null;
          created_at?: string;
          is_staff?: boolean;
          order_status?: OrderStatus;
          order_amount?: number | null;
          ordered_at?: string | null;
          paid_at?: string | null;
          paid_amount?: number;
          staff_role?: string | null;
          selection_confirmed_at?: string | null;
          first_login_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "students_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] }
        ];
      };
      photos: {
        Row: {
          id: string;
          class_id: string;
          storage_path: string;
          filename: string;
          file_type: PhotoFileType;
          category: PhotoCategory;
          student_id: string | null;
          uploaded_at: string;
          file_kind: PhotoFileKind;
        };
        Insert: {
          id?: string;
          class_id: string;
          storage_path: string;
          filename: string;
          file_type?: PhotoFileType;
          category?: PhotoCategory;
          student_id?: string | null;
          uploaded_at?: string;
          file_kind?: PhotoFileKind;
        };
        Update: {
          id?: string;
          class_id?: string;
          storage_path?: string;
          filename?: string;
          file_type?: PhotoFileType;
          category?: PhotoCategory;
          student_id?: string | null;
          uploaded_at?: string;
          file_kind?: PhotoFileKind;
        };
        Relationships: [
          { foreignKeyName: "photos_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "photos_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }
        ];
      };
      favorites: {
        Row: { id: string; student_id: string; photo_id: string; created_at: string };
        Insert: { id?: string; student_id: string; photo_id: string; created_at?: string };
        Update: { id?: string; student_id?: string; photo_id?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "favorites_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "favorites_photo_id_fkey"; columns: ["photo_id"]; isOneToOne: false; referencedRelation: "photos"; referencedColumns: ["id"] }
        ];
      };
      album_selections: {
        Row: { id: string; student_id: string; photo_id: string; created_at: string };
        Insert: { id?: string; student_id: string; photo_id: string; created_at?: string };
        Update: { id?: string; student_id?: string; photo_id?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "album_selections_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "album_selections_photo_id_fkey"; columns: ["photo_id"]; isOneToOne: false; referencedRelation: "photos"; referencedColumns: ["id"] }
        ];
      };
      mom_links: {
        Row: {
          id: string;
          class_id: string;
          token: string;
          expires_at: string;
          is_active: boolean;
          created_at: string;
          expiring_soon_notified_at: string | null;
          expired_notified_at: string | null;
        };
        Insert: {
          id?: string;
          class_id: string;
          token: string;
          expires_at: string;
          is_active?: boolean;
          created_at?: string;
          expiring_soon_notified_at?: string | null;
          expired_notified_at?: string | null;
        };
        Update: {
          id?: string;
          class_id?: string;
          token?: string;
          expires_at?: string;
          is_active?: boolean;
          created_at?: string;
          expiring_soon_notified_at?: string | null;
          expired_notified_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "mom_links_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] }
        ];
      };
      global_settings: {
        Row: {
          id: boolean;
          mom_links_globally_disabled: boolean;
          updated_at: string;
          push_mom_link_checks_enabled: boolean;
        };
        Insert: {
          id?: boolean;
          mom_links_globally_disabled?: boolean;
          updated_at?: string;
          push_mom_link_checks_enabled?: boolean;
        };
        Update: {
          id?: boolean;
          mom_links_globally_disabled?: boolean;
          updated_at?: string;
          push_mom_link_checks_enabled?: boolean;
        };
        Relationships: [];
      };
      admin_users: {
        Row: { id: string; full_name: string | null; created_at: string; role_id: string };
        Insert: { id: string; full_name?: string | null; created_at?: string; role_id: string };
        Update: { id?: string; full_name?: string | null; created_at?: string; role_id?: string };
        // id -> auth.users(id) навмисно не включено — інша схема (auth, не
        // public), postgrest-js embed-резолюція її й так не використовує.
        Relationships: [
          { foreignKeyName: "admin_users_role_id_fkey"; columns: ["role_id"]; isOneToOne: false; referencedRelation: "admin_roles"; referencedColumns: ["id"] }
        ];
      };
      album_type_slots: {
        Row: {
          id: string;
          album_type_id: string;
          key: string;
          label: string;
          kind: SlotKind;
          max_photos: number;
          filled_by: SlotFilledBy;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          album_type_id: string;
          key: string;
          label: string;
          kind: SlotKind;
          max_photos?: number;
          filled_by?: SlotFilledBy;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          album_type_id?: string;
          key?: string;
          label?: string;
          kind?: SlotKind;
          max_photos?: number;
          filled_by?: SlotFilledBy;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "album_type_slots_album_type_id_fkey"; columns: ["album_type_id"]; isOneToOne: false; referencedRelation: "album_types"; referencedColumns: ["id"] }
        ];
      };
      student_slot_photos: {
        Row: {
          id: string;
          student_id: string;
          slot_id: string;
          photo_id: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          slot_id: string;
          photo_id: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          slot_id?: string;
          photo_id?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "student_slot_photos_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "student_slot_photos_slot_id_fkey"; columns: ["slot_id"]; isOneToOne: false; referencedRelation: "album_type_slots"; referencedColumns: ["id"] },
          { foreignKeyName: "student_slot_photos_photo_id_fkey"; columns: ["photo_id"]; isOneToOne: false; referencedRelation: "photos"; referencedColumns: ["id"] }
        ];
      };
      student_slot_answers: {
        Row: { id: string; student_id: string; slot_id: string; answer: string; updated_at: string };
        Insert: { id?: string; student_id: string; slot_id: string; answer?: string; updated_at?: string };
        Update: { id?: string; student_id?: string; slot_id?: string; answer?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "student_slot_answers_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "student_slot_answers_slot_id_fkey"; columns: ["slot_id"]; isOneToOne: false; referencedRelation: "album_type_slots"; referencedColumns: ["id"] }
        ];
      };
      admin_roles: {
        Row: { id: string; name: string; tab_keys: string[]; is_owner: boolean; created_at: string };
        Insert: { id?: string; name: string; tab_keys?: string[]; is_owner?: boolean; created_at?: string };
        Update: { id?: string; name?: string; tab_keys?: string[]; is_owner?: boolean; created_at?: string };
        Relationships: [];
      };
      push_subscriptions: {
        Row: { id: string; admin_id: string; endpoint: string; p256dh: string; auth: string; created_at: string };
        Insert: {
          id?: string;
          admin_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "push_subscriptions_admin_id_fkey"; columns: ["admin_id"]; isOneToOne: false; referencedRelation: "admin_users"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
