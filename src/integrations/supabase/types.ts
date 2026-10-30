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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      demonstrativos: {
        Row: {
          aprovado_por: string
          conteudo: Json
          criado_em: string
          criador_email: string
          data: string
          decidido_em: string | null
          decisao: string | null
          id: string
          ressalvas: string
          token: string
          user_id: string
        }
        Insert: {
          aprovado_por?: string
          conteudo: Json
          criado_em?: string
          criador_email?: string
          data: string
          decidido_em?: string | null
          decisao?: string | null
          id?: string
          ressalvas?: string
          token?: string
          user_id: string
        }
        Update: {
          aprovado_por?: string
          conteudo?: Json
          criado_em?: string
          criador_email?: string
          data?: string
          decidido_em?: string | null
          decisao?: string | null
          id?: string
          ressalvas?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      extratos: {
        Row: {
          atualizado_em: string
          dados: Json
          id: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          dados: Json
          id: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          dados?: Json
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      previsoes: {
        Row: {
          arquivo: string
          banco: string
          categoria: string
          contraparte: string
          criado_em: string
          descricao: string
          documento: string
          id: string
          tipo: string
          user_id: string
          valor: number
          vencimento: string
        }
        Insert: {
          arquivo?: string
          banco?: string
          categoria?: string
          contraparte?: string
          criado_em?: string
          descricao?: string
          documento?: string
          id?: string
          tipo: string
          user_id: string
          valor: number
          vencimento: string
        }
        Update: {
          arquivo?: string
          banco?: string
          categoria?: string
          contraparte?: string
          criado_em?: string
          descricao?: string
          documento?: string
          id?: string
          tipo?: string
          user_id?: string
          valor?: number
          vencimento?: string
        }
        Relationships: []
      }
      realizados: {
        Row: {
          arquivo: string
          categoria: string
          chave: string
          conta: string
          contraparte: string
          criado_em: string
          data: string
          descricao: string
          documento: string
          id: string
          tipo: string
          user_id: string
          valor: number
          vinculo: string | null
        }
        Insert: {
          arquivo?: string
          categoria?: string
          chave: string
          conta?: string
          contraparte?: string
          criado_em?: string
          data: string
          descricao?: string
          documento?: string
          id?: string
          tipo: string
          user_id: string
          valor: number
          vinculo?: string | null
        }
        Update: {
          arquivo?: string
          categoria?: string
          chave?: string
          conta?: string
          contraparte?: string
          criado_em?: string
          data?: string
          descricao?: string
          documento?: string
          id?: string
          tipo?: string
          user_id?: string
          valor?: number
          vinculo?: string | null
        }
        Relationships: []
      }
      transferencias: {
        Row: {
          criado_em: string
          data: string
          destino: string
          id: string
          origem: string
          user_id: string
          valor: number
        }
        Insert: {
          criado_em?: string
          data?: string
          destino: string
          id?: string
          origem: string
          user_id: string
          valor: number
        }
        Update: {
          criado_em?: string
          data?: string
          destino?: string
          id?: string
          origem?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
