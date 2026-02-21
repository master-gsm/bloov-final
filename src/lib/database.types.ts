export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          id: string
          name: string
          start_date: string
          end_date: string
          is_closed: boolean | null
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          updated_at: string | null
          status: string
        }
        Insert: {
          id?: string
          name: string
          start_date: string
          end_date: string
          is_closed?: boolean | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          status?: string
        }
        Update: {
          id?: string
          name?: string
          start_date?: string
          end_date?: string
          is_closed?: boolean | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          status?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          code: string
          name: string
          name_ar: string | null
          type: string
          parent_id: string | null
          is_active: boolean | null
          is_system: boolean | null
          description: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          code: string
          name: string
          name_ar?: string | null
          type: string
          parent_id?: string | null
          is_active?: boolean | null
          is_system?: boolean | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          code?: string
          name?: string
          name_ar?: string | null
          type?: string
          parent_id?: string | null
          is_active?: boolean | null
          is_system?: boolean | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          details: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          details?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          details?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      ai_analysis_logs: {
        Row: {
          id: string
          query_type: string
          input_data: Json | null
          ai_response: Json | null
          user_query: string | null
          summary: string | null
          tokens_used: number | null
          processing_time_ms: number | null
          created_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          query_type: string
          input_data?: Json | null
          ai_response?: Json | null
          user_query?: string | null
          summary?: string | null
          tokens_used?: number | null
          processing_time_ms?: number | null
          created_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          query_type?: string
          input_data?: Json | null
          ai_response?: Json | null
          user_query?: string | null
          summary?: string | null
          tokens_used?: number | null
          processing_time_ms?: number | null
          created_by?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      ai_forecasts: {
        Row: {
          id: string
          product_id: string | null
          forecast_period: string
          forecast_date: string
          predicted_quantity: number
          predicted_revenue: number
          confidence_score: number | null
          factors: Json | null
          historical_data_points: number | null
          created_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          forecast_period: string
          forecast_date: string
          predicted_quantity?: number
          predicted_revenue?: number
          confidence_score?: number | null
          factors?: Json | null
          historical_data_points?: number | null
          created_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          forecast_period?: string
          forecast_date?: string
          predicted_quantity?: number
          predicted_revenue?: number
          confidence_score?: number | null
          factors?: Json | null
          historical_data_points?: number | null
          created_by?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          id: string
          insight_type: string
          subject_id: string | null
          subject_type: string | null
          title: string
          description: string | null
          recommendation: string | null
          priority: string | null
          status: string | null
          metadata: Json | null
          expires_at: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          insight_type: string
          subject_id?: string | null
          subject_type?: string | null
          title: string
          description?: string | null
          recommendation?: string | null
          priority?: string | null
          status?: string | null
          metadata?: Json | null
          expires_at?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          insight_type?: string
          subject_id?: string | null
          subject_type?: string | null
          title?: string
          description?: string | null
          recommendation?: string | null
          priority?: string | null
          status?: string | null
          metadata?: Json | null
          expires_at?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          operation: string
          old_values: Json | null
          new_values: Json | null
          changed_by: string | null
          changed_at: string | null
          ip_address: string | null
          user_agent: string | null
          branch_id: string | null
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          operation: string
          old_values?: Json | null
          new_values?: Json | null
          changed_by?: string | null
          changed_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
          branch_id?: string | null
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          operation?: string
          old_values?: Json | null
          new_values?: Json | null
          changed_by?: string | null
          changed_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
          branch_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          table_name: string | null
          record_id: string | null
          branch_id: string | null
          old_data: Json | null
          new_data: Json | null
          records_affected: number | null
          ip_address: string | null
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          table_name?: string | null
          record_id?: string | null
          branch_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          records_affected?: number | null
          ip_address?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          table_name?: string | null
          record_id?: string | null
          branch_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          records_affected?: number | null
          ip_address?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      bouquet_components: {
        Row: {
          id: string
          bouquet_product_id: string
          component_product_id: string
          quantity: number
          created_at: string | null
        }
        Insert: {
          id?: string
          bouquet_product_id: string
          component_product_id: string
          quantity?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          bouquet_product_id?: string
          component_product_id?: string
          quantity?: number
          created_at?: string | null
        }
        Relationships: []
      }
      branch_stock: {
        Row: {
          id: string
          branch_id: string
          product_id: string
          quantity: number
          min_stock_level: number | null
          max_stock_level: number | null
          last_restock_date: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          branch_id: string
          product_id: string
          quantity?: number
          min_stock_level?: number | null
          max_stock_level?: number | null
          last_restock_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          branch_id?: string
          product_id?: string
          quantity?: number
          min_stock_level?: number | null
          max_stock_level?: number | null
          last_restock_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          id: string
          name: string
          code: string
          location: string | null
          city: string | null
          phone: string | null
          manager_id: string | null
          is_active: boolean | null
          opening_date: string | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          code: string
          location?: string | null
          city?: string | null
          phone?: string | null
          manager_id?: string | null
          is_active?: boolean | null
          opening_date?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          code?: string
          location?: string | null
          city?: string | null
          phone?: string | null
          manager_id?: string | null
          is_active?: boolean | null
          opening_date?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cash_registers: {
        Row: {
          id: string
          open_date: string
          opening_balance: number
          closing_balance: number | null
          expected_balance: number | null
          status: string
          opened_by: string | null
          closed_by: string | null
          opened_at: string | null
          closed_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          open_date?: string
          opening_balance?: number
          closing_balance?: number | null
          expected_balance?: number | null
          status?: string
          opened_by?: string | null
          closed_by?: string | null
          opened_at?: string | null
          closed_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          open_date?: string
          opening_balance?: number
          closing_balance?: number | null
          expected_balance?: number | null
          status?: string
          opened_by?: string | null
          closed_by?: string | null
          opened_at?: string | null
          closed_at?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      cash_shifts: {
        Row: {
          id: string
          shift_number: string
          user_id: string
          opening_balance: number
          expected_balance: number | null
          actual_balance: number | null
          difference: number | null
          status: string
          opened_at: string
          closed_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
          branch_id: string | null
          is_deleted: boolean
          version: number
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          shift_number: string
          user_id: string
          opening_balance?: number
          expected_balance?: number | null
          actual_balance?: number | null
          difference?: number | null
          status?: string
          opened_at?: string
          closed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          branch_id?: string | null
          is_deleted?: boolean
          version?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          shift_number?: string
          user_id?: string
          opening_balance?: number
          expected_balance?: number | null
          actual_balance?: number | null
          difference?: number | null
          status?: string
          opened_at?: string
          closed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          branch_id?: string | null
          is_deleted?: boolean
          version?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          id: string
          shift_id: string
          transaction_type: string
          amount: number
          reference_id: string | null
          reference_type: string | null
          description: string | null
          description_ar: string | null
          created_by: string
          created_at: string
          branch_id: string | null
          is_deleted: boolean
          version: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          shift_id: string
          transaction_type: string
          amount: number
          reference_id?: string | null
          reference_type?: string | null
          description?: string | null
          description_ar?: string | null
          created_by: string
          created_at?: string
          branch_id?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          shift_id?: string
          transaction_type?: string
          amount?: number
          reference_id?: string | null
          reference_type?: string | null
          description?: string | null
          description_ar?: string | null
          created_by?: string
          created_at?: string
          branch_id?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          name: string
          name_ar: string
          type: string
          description: string | null
          description_ar: string | null
          parent_id: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          name_ar: string
          type: string
          description?: string | null
          description_ar?: string | null
          parent_id?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          name_ar?: string
          type?: string
          description?: string | null
          description_ar?: string | null
          parent_id?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          id: string
          account_code: string
          account_name: string
          account_name_ar: string
          account_type: string
          account_subtype: string | null
          parent_account_id: string | null
          is_active: boolean | null
          is_system: boolean | null
          branch_id: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          account_code: string
          account_name: string
          account_name_ar: string
          account_type: string
          account_subtype?: string | null
          parent_account_id?: string | null
          is_active?: boolean | null
          is_system?: boolean | null
          branch_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          account_code?: string
          account_name?: string
          account_name_ar?: string
          account_type?: string
          account_subtype?: string | null
          parent_account_id?: string | null
          is_active?: boolean | null
          is_system?: boolean | null
          branch_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Relationships: []
      }
      commission_accruals: {
        Row: {
          id: string
          employee_id: string
          sale_id: string
          sale_channel: string
          sale_amount: number
          commission_rate: number
          commission_amount: number
          status: string
          accrued_at: string | null
          voided_at: string | null
          paid_at: string | null
          payroll_run_id: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          sale_id: string
          sale_channel: string
          sale_amount: number
          commission_rate: number
          commission_amount: number
          status?: string
          accrued_at?: string | null
          voided_at?: string | null
          paid_at?: string | null
          payroll_run_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          sale_id?: string
          sale_channel?: string
          sale_amount?: number
          commission_rate?: number
          commission_amount?: number
          status?: string
          accrued_at?: string | null
          voided_at?: string | null
          paid_at?: string | null
          payroll_run_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compensation_plans: {
        Row: {
          id: string
          employee_id: string
          base_salary: number
          commission_rate_internal: number
          commission_rate_external: number
          effective_from: string
          effective_to: string | null
          branch_id: string | null
          notes: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          commission_rate_salla: number | null
          is_active: boolean | null
        }
        Insert: {
          id?: string
          employee_id: string
          base_salary?: number
          commission_rate_internal?: number
          commission_rate_external?: number
          effective_from?: string
          effective_to?: string | null
          branch_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          commission_rate_salla?: number | null
          is_active?: boolean | null
        }
        Update: {
          id?: string
          employee_id?: string
          base_salary?: number
          commission_rate_internal?: number
          commission_rate_external?: number
          effective_from?: string
          effective_to?: string | null
          branch_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          commission_rate_salla?: number | null
          is_active?: boolean | null
        }
        Relationships: []
      }
      customer_loyalty: {
        Row: {
          id: string
          customer_id: string
          points: number
          total_earned: number
          total_redeemed: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          points?: number
          total_earned?: number
          total_redeemed?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          points?: number
          total_earned?: number
          total_redeemed?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_payments: {
        Row: {
          id: string
          payment_number: string
          customer_id: string
          payment_date: string
          amount: number
          payment_method: string
          reference_number: string | null
          notes: string | null
          journal_entry_id: string | null
          branch_id: string | null
          created_at: string | null
          created_by: string | null
          is_deleted: boolean | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          payment_number: string
          customer_id: string
          payment_date: string
          amount: number
          payment_method: string
          reference_number?: string | null
          notes?: string | null
          journal_entry_id?: string | null
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          payment_number?: string
          customer_id?: string
          payment_date?: string
          amount?: number
          payment_method?: string
          reference_number?: string | null
          notes?: string | null
          journal_entry_id?: string | null
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          code: string
          name: string
          name_ar: string | null
          email: string | null
          phone: string | null
          address: string | null
          address_ar: string | null
          city: string | null
          city_ar: string | null
          notes: string | null
          notes_ar: string | null
          credit_limit: number | null
          current_balance: number | null
          is_active: boolean | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          total_spent: number | null
          order_count: number | null
          tier: string | null
          last_order_date: string | null
          tier_updated_at: string | null
          total_spend: number | null
          total_orders: number | null
          loyalty_points: number | null
          last_purchase_date: string | null
          preference_note: string | null
          is_top_spender: boolean | null
          is_most_frequent: boolean | null
          valid_loyalty_points: number | null
          branch_id: string | null
        }
        Insert: {
          id?: string
          code: string
          name: string
          name_ar?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          address_ar?: string | null
          city?: string | null
          city_ar?: string | null
          notes?: string | null
          notes_ar?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          total_spent?: number | null
          order_count?: number | null
          tier?: string | null
          last_order_date?: string | null
          tier_updated_at?: string | null
          total_spend?: number | null
          total_orders?: number | null
          loyalty_points?: number | null
          last_purchase_date?: string | null
          preference_note?: string | null
          is_top_spender?: boolean | null
          is_most_frequent?: boolean | null
          valid_loyalty_points?: number | null
          branch_id?: string | null
        }
        Update: {
          id?: string
          code?: string
          name?: string
          name_ar?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          address_ar?: string | null
          city?: string | null
          city_ar?: string | null
          notes?: string | null
          notes_ar?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          total_spent?: number | null
          order_count?: number | null
          tier?: string | null
          last_order_date?: string | null
          tier_updated_at?: string | null
          total_spend?: number | null
          total_orders?: number | null
          loyalty_points?: number | null
          last_purchase_date?: string | null
          preference_note?: string | null
          is_top_spender?: boolean | null
          is_most_frequent?: boolean | null
          valid_loyalty_points?: number | null
          branch_id?: string | null
        }
        Relationships: []
      }
      employee_commissions: {
        Row: {
          id: string
          employee_id: string
          sale_id: string
          commission_rate: number
          sale_amount: number
          commission_amount: number
          payment_id: string | null
          is_paid: boolean | null
          created_at: string | null
          sale_channel: string | null
          status: string | null
          voided_at: string | null
          void_reason: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          sale_id: string
          commission_rate: number
          sale_amount: number
          commission_amount: number
          payment_id?: string | null
          is_paid?: boolean | null
          created_at?: string | null
          sale_channel?: string | null
          status?: string | null
          voided_at?: string | null
          void_reason?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          sale_id?: string
          commission_rate?: number
          sale_amount?: number
          commission_amount?: number
          payment_id?: string | null
          is_paid?: boolean | null
          created_at?: string | null
          sale_channel?: string | null
          status?: string | null
          voided_at?: string | null
          void_reason?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          id: string
          user_id: string | null
          employee_code: string
          full_name: string
          position: string | null
          department: string | null
          hire_date: string
          end_date: string | null
          is_active: boolean | null
          branch_id: string | null
          created_at: string | null
          updated_at: string | null
          full_name_ar: string | null
          position_ar: string | null
          phone: string | null
          email: string | null
          national_id: string | null
          bank_account: string | null
          deactivated_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          employee_code: string
          full_name: string
          position?: string | null
          department?: string | null
          hire_date?: string
          end_date?: string | null
          is_active?: boolean | null
          branch_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          full_name_ar?: string | null
          position_ar?: string | null
          phone?: string | null
          email?: string | null
          national_id?: string | null
          bank_account?: string | null
          deactivated_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          employee_code?: string
          full_name?: string
          position?: string | null
          department?: string | null
          hire_date?: string
          end_date?: string | null
          is_active?: boolean | null
          branch_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          full_name_ar?: string | null
          position_ar?: string | null
          phone?: string | null
          email?: string | null
          national_id?: string | null
          bank_account?: string | null
          deactivated_at?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      event_orders: {
        Row: {
          id: string
          sale_id: string | null
          event_type: string
          event_date: string | null
          delivery_time: string | null
          delivery_address: string | null
          recipient_name: string | null
          recipient_phone: string | null
          card_message: string | null
          special_instructions: string | null
          status: string
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          sale_id?: string | null
          event_type?: string
          event_date?: string | null
          delivery_time?: string | null
          delivery_address?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          card_message?: string | null
          special_instructions?: string | null
          status?: string
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          sale_id?: string | null
          event_type?: string
          event_date?: string | null
          delivery_time?: string | null
          delivery_address?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          card_message?: string | null
          special_instructions?: string | null
          status?: string
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          expense_number: string
          category: string
          amount: number
          description: string | null
          expense_date: string
          payment_method: string
          cash_register_id: string | null
          created_by: string | null
          created_at: string | null
          branch_id: string | null
          is_deleted: boolean
          version: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          expense_account_id: string | null
        }
        Insert: {
          id?: string
          expense_number: string
          category?: string
          amount?: number
          description?: string | null
          expense_date?: string
          payment_method?: string
          cash_register_id?: string | null
          created_by?: string | null
          created_at?: string | null
          branch_id?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          expense_account_id?: string | null
        }
        Update: {
          id?: string
          expense_number?: string
          category?: string
          amount?: number
          description?: string | null
          expense_date?: string
          payment_method?: string
          cash_register_id?: string | null
          created_by?: string | null
          created_at?: string | null
          branch_id?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          expense_account_id?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          product_id: string
          quantity: number
          last_updated: string | null
          updated_by: string | null
          branch_id: string | null
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          last_updated?: string | null
          updated_by?: string | null
          branch_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          last_updated?: string | null
          updated_by?: string | null
          branch_id?: string | null
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          id: string
          product_id: string
          movement_type: string
          quantity: number
          reference_type: string | null
          reference_id: string | null
          notes: string | null
          notes_ar: string | null
          created_by: string | null
          created_at: string | null
          is_deleted: boolean | null
          deleted_at: string | null
          version: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          product_id: string
          movement_type: string
          quantity: number
          reference_type?: string | null
          reference_id?: string | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          movement_type?: string
          quantity?: number
          reference_type?: string | null
          reference_id?: string | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string
          product_id: string
          description: string | null
          description_ar: string | null
          quantity: number
          unit_price: number
          discount: number | null
          total: number
          created_at: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          product_id: string
          description?: string | null
          description_ar?: string | null
          quantity: number
          unit_price: number
          discount?: number | null
          total: number
          created_at?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          product_id?: string
          description?: string | null
          description_ar?: string | null
          quantity?: number
          unit_price?: number
          discount?: number | null
          total?: number
          created_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          invoice_number: string
          sale_id: string | null
          customer_id: string | null
          invoice_date: string
          due_date: string | null
          status: string
          subtotal: number
          tax: number | null
          discount: number | null
          total: number
          paid_amount: number | null
          notes: string | null
          notes_ar: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          invoice_number: string
          sale_id?: string | null
          customer_id?: string | null
          invoice_date?: string
          due_date?: string | null
          status?: string
          subtotal?: number
          tax?: number | null
          discount?: number | null
          total?: number
          paid_amount?: number | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          invoice_number?: string
          sale_id?: string | null
          customer_id?: string | null
          invoice_date?: string
          due_date?: string | null
          status?: string
          subtotal?: number
          tax?: number | null
          discount?: number | null
          total?: number
          paid_amount?: number | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          id: string
          entry_number: string
          date: string
          description: string
          status: string | null
          branch_id: string
          currency_code: string | null
          exchange_rate: number | null
          period_locked: boolean | null
          original_entry_id: string | null
          reverse_entry_id: string | null
          created_by: string
          posted_by: string | null
          voided_by: string | null
          created_at: string | null
          posted_at: string | null
          voided_at: string | null
          updated_at: string | null
          version: number | null
          reference_type: string | null
          reference_id: string | null
        }
        Insert: {
          id?: string
          entry_number: string
          date: string
          description: string
          status?: string | null
          branch_id: string
          currency_code?: string | null
          exchange_rate?: number | null
          period_locked?: boolean | null
          original_entry_id?: string | null
          reverse_entry_id?: string | null
          created_by: string
          posted_by?: string | null
          voided_by?: string | null
          created_at?: string | null
          posted_at?: string | null
          voided_at?: string | null
          updated_at?: string | null
          version?: number | null
          reference_type?: string | null
          reference_id?: string | null
        }
        Update: {
          id?: string
          entry_number?: string
          date?: string
          description?: string
          status?: string | null
          branch_id?: string
          currency_code?: string | null
          exchange_rate?: number | null
          period_locked?: boolean | null
          original_entry_id?: string | null
          reverse_entry_id?: string | null
          created_by?: string
          posted_by?: string | null
          voided_by?: string | null
          created_at?: string | null
          posted_at?: string | null
          voided_at?: string | null
          updated_at?: string | null
          version?: number | null
          reference_type?: string | null
          reference_id?: string | null
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          id: string
          journal_entry_id: string
          account_id: string
          line_type: string
          amount: number
          description: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          journal_entry_id: string
          account_id: string
          line_type: string
          amount: number
          description?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          journal_entry_id?: string
          account_id?: string
          line_type?: string
          amount?: number
          description?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      journal_lines: {
        Row: {
          id: string
          journal_entry_id: string
          account_id: string
          debit: number | null
          credit: number | null
          base_debit: number | null
          base_credit: number | null
          description: string | null
          line_number: number
          created_at: string | null
        }
        Insert: {
          id?: string
          journal_entry_id: string
          account_id: string
          debit?: number | null
          credit?: number | null
          base_debit?: number | null
          base_credit?: number | null
          description?: string | null
          line_number: number
          created_at?: string | null
        }
        Update: {
          id?: string
          journal_entry_id?: string
          account_id?: string
          debit?: number | null
          credit?: number | null
          base_debit?: number | null
          base_credit?: number | null
          description?: string | null
          line_number?: number
          created_at?: string | null
        }
        Relationships: []
      }
      loyalty_point_transactions: {
        Row: {
          id: string
          customer_id: string
          sale_id: string | null
          points_earned: number
          points_redeemed: number
          earned_date: string
          expiry_date: string
          description: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          customer_id: string
          sale_id?: string | null
          points_earned?: number
          points_redeemed?: number
          earned_date?: string
          expiry_date?: string
          description?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          customer_id?: string
          sale_id?: string | null
          points_earned?: number
          points_redeemed?: number
          earned_date?: string
          expiry_date?: string
          description?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      loyalty_settings: {
        Row: {
          id: number
          vip_threshold: number | null
          frequent_threshold: number | null
          inactive_days: number | null
          points_to_currency_rate: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          vip_threshold?: number | null
          frequent_threshold?: number | null
          inactive_days?: number | null
          points_to_currency_rate?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          vip_threshold?: number | null
          frequent_threshold?: number | null
          inactive_days?: number | null
          points_to_currency_rate?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          id: string
          customer_id: string
          sale_id: string | null
          points: number
          type: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          sale_id?: string | null
          points?: number
          type: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          sale_id?: string | null
          points?: number
          type?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      operating_expenses: {
        Row: {
          id: string
          expense_number: string
          expense_type: string
          description: string
          description_ar: string | null
          amount: number
          expense_date: string
          payment_method: string | null
          notes: string | null
          notes_ar: string | null
          partner_contribution_id: string | null
          created_by: string | null
          created_at: string | null
          attachment_url: string | null
          branch_id: string | null
          is_deleted: boolean | null
          deleted_at: string | null
          version: number | null
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          expense_number: string
          expense_type?: string
          description: string
          description_ar?: string | null
          amount?: number
          expense_date?: string
          payment_method?: string | null
          notes?: string | null
          notes_ar?: string | null
          partner_contribution_id?: string | null
          created_by?: string | null
          created_at?: string | null
          attachment_url?: string | null
          branch_id?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          expense_number?: string
          expense_type?: string
          description?: string
          description_ar?: string | null
          amount?: number
          expense_date?: string
          payment_method?: string | null
          notes?: string | null
          notes_ar?: string | null
          partner_contribution_id?: string | null
          created_by?: string | null
          created_at?: string | null
          attachment_url?: string | null
          branch_id?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number | null
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      partner_contributions: {
        Row: {
          id: string
          partner_id: string
          amount: number
          description: string
          description_ar: string | null
          contribution_date: string
          created_by: string | null
          created_at: string
          contribution_type: string | null
          attachment_url: string | null
          is_deleted: boolean
          version: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          partner_id: string
          amount?: number
          description?: string
          description_ar?: string | null
          contribution_date?: string
          created_by?: string | null
          created_at?: string
          contribution_type?: string | null
          attachment_url?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          partner_id?: string
          amount?: number
          description?: string
          description_ar?: string | null
          contribution_date?: string
          created_by?: string | null
          created_at?: string
          contribution_type?: string | null
          attachment_url?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      partner_distributions: {
        Row: {
          id: string
          partner_id: string
          period_start: string
          period_end: string
          total_revenue: number
          total_expenses: number
          net_profit: number
          partner_share: number
          paid_amount: number | null
          status: string
          notes: string | null
          notes_ar: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          partner_id: string
          period_start: string
          period_end: string
          total_revenue?: number
          total_expenses?: number
          net_profit?: number
          partner_share?: number
          paid_amount?: number | null
          status?: string
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          partner_id?: string
          period_start?: string
          period_end?: string
          total_revenue?: number
          total_expenses?: number
          net_profit?: number
          partner_share?: number
          paid_amount?: number | null
          status?: string
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      partner_settlements: {
        Row: {
          id: string
          from_partner_id: string
          to_partner_id: string
          amount: number
          description: string
          description_ar: string | null
          settlement_date: string
          created_by: string | null
          created_at: string
          attachment_url: string | null
          is_deleted: boolean
          version: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          status: string | null
          void_reason: string | null
        }
        Insert: {
          id?: string
          from_partner_id: string
          to_partner_id: string
          amount?: number
          description?: string
          description_ar?: string | null
          settlement_date?: string
          created_by?: string | null
          created_at?: string
          attachment_url?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          status?: string | null
          void_reason?: string | null
        }
        Update: {
          id?: string
          from_partner_id?: string
          to_partner_id?: string
          amount?: number
          description?: string
          description_ar?: string | null
          settlement_date?: string
          created_by?: string | null
          created_at?: string
          attachment_url?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          status?: string | null
          void_reason?: string | null
        }
        Relationships: []
      }
      partners: {
        Row: {
          id: string
          name: string
          name_ar: string
          share_percentage: number
          email: string | null
          phone: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          name_ar: string
          share_percentage: number
          email?: string | null
          phone?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          name_ar?: string
          share_percentage?: number
          email?: string | null
          phone?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
          id: string
          payroll_run_id: string
          employee_id: string
          base_salary: number | null
          commission_total: number | null
          bonuses: number | null
          deductions: number | null
          net_pay: number | null
          payment_method: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          payroll_run_id: string
          employee_id: string
          base_salary?: number | null
          commission_total?: number | null
          bonuses?: number | null
          deductions?: number | null
          net_pay?: number | null
          payment_method?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          payroll_run_id?: string
          employee_id?: string
          base_salary?: number | null
          commission_total?: number | null
          bonuses?: number | null
          deductions?: number | null
          net_pay?: number | null
          payment_method?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      payroll_lines: {
        Row: {
          id: string
          payroll_run_id: string
          employee_id: string
          base_salary: number
          commissions: number
          deductions: number
          advances: number
          net_pay: number
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          payroll_run_id: string
          employee_id: string
          base_salary?: number
          commissions?: number
          deductions?: number
          advances?: number
          net_pay?: number
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          payroll_run_id?: string
          employee_id?: string
          base_salary?: number
          commissions?: number
          deductions?: number
          advances?: number
          net_pay?: number
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payroll_runs: {
        Row: {
          id: string
          run_number: string
          period_year: number
          period_month: number
          branch_id: string | null
          status: string
          total_salaries: number | null
          total_commissions: number | null
          total_deductions: number | null
          net_pay: number | null
          posted_at: string | null
          paid_at: string | null
          posted_by: string | null
          paid_by: string | null
          expense_id: string | null
          journal_entry_id: string | null
          notes: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          run_number: string
          period_year: number
          period_month: number
          branch_id?: string | null
          status?: string
          total_salaries?: number | null
          total_commissions?: number | null
          total_deductions?: number | null
          net_pay?: number | null
          posted_at?: string | null
          paid_at?: string | null
          posted_by?: string | null
          paid_by?: string | null
          expense_id?: string | null
          journal_entry_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          run_number?: string
          period_year?: number
          period_month?: number
          branch_id?: string | null
          status?: string
          total_salaries?: number | null
          total_commissions?: number | null
          total_deductions?: number | null
          net_pay?: number | null
          posted_at?: string | null
          paid_at?: string | null
          posted_by?: string | null
          paid_by?: string | null
          expense_id?: string | null
          journal_entry_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          id: string
          name: string
          name_ar: string
          module: string
          action: string
          description: string | null
          description_ar: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          name_ar: string
          module: string
          action: string
          description?: string | null
          description_ar?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          name_ar?: string
          module?: string
          action?: string
          description?: string | null
          description_ar?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      product_costing: {
        Row: {
          id: string
          product_id: string
          branch_id: string
          quantity_on_hand: number
          average_cost: number
          total_value: number | null
          last_purchase_date: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          product_id: string
          branch_id: string
          quantity_on_hand?: number
          average_cost?: number
          total_value?: number | null
          last_purchase_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          branch_id?: string
          quantity_on_hand?: number
          average_cost?: number
          total_value?: number | null
          last_purchase_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      product_recipes: {
        Row: {
          id: string
          product_id: string
          material_id: string
          quantity: number
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          product_id: string
          material_id: string
          quantity?: number
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          material_id?: string
          quantity?: number
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          sku: string
          name: string
          name_ar: string
          description: string | null
          description_ar: string | null
          category_id: string | null
          type: string
          unit: string
          unit_ar: string
          purchase_price: number
          sale_price: number
          min_stock_level: number | null
          image_url: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          classification: string | null
        }
        Insert: {
          id?: string
          sku: string
          name: string
          name_ar: string
          description?: string | null
          description_ar?: string | null
          category_id?: string | null
          type: string
          unit?: string
          unit_ar?: string
          purchase_price?: number
          sale_price?: number
          min_stock_level?: number | null
          image_url?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          classification?: string | null
        }
        Update: {
          id?: string
          sku?: string
          name?: string
          name_ar?: string
          description?: string | null
          description_ar?: string | null
          category_id?: string | null
          type?: string
          unit?: string
          unit_ar?: string
          purchase_price?: number
          sale_price?: number
          min_stock_level?: number | null
          image_url?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          classification?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          full_name_ar: string | null
          role_id: string | null
          language: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          email: string
          full_name: string
          full_name_ar?: string | null
          role_id?: string | null
          language?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          full_name_ar?: string | null
          role_id?: string | null
          language?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          id: string
          purchase_id: string
          product_id: string
          quantity: number
          unit_price: number
          discount: number | null
          total: number
          created_at: string | null
          is_deleted: boolean
          version: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          purchase_id: string
          product_id: string
          quantity: number
          unit_price: number
          discount?: number | null
          total: number
          created_at?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          purchase_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          discount?: number | null
          total?: number
          created_at?: string | null
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      purchase_receipts: {
        Row: {
          id: string
          receipt_number: string
          purchase_id: string
          received_date: string
          status: string
          total_value: number
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
          version: number
        }
        Insert: {
          id?: string
          receipt_number: string
          purchase_id: string
          received_date?: string
          status?: string
          total_value?: number
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          version?: number
        }
        Update: {
          id?: string
          receipt_number?: string
          purchase_id?: string
          received_date?: string
          status?: string
          total_value?: number
          notes?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      purchases: {
        Row: {
          id: string
          purchase_number: string
          supplier_id: string | null
          purchase_date: string
          status: string
          subtotal: number
          tax: number | null
          discount: number | null
          total: number
          paid_amount: number | null
          payment_status: string
          payment_method: string | null
          notes: string | null
          notes_ar: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          attachment_url: string | null
          branch_id: string | null
          is_deleted: boolean | null
          deleted_at: string | null
          version: number | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          purchase_number: string
          supplier_id?: string | null
          purchase_date?: string
          status?: string
          subtotal?: number
          tax?: number | null
          discount?: number | null
          total?: number
          paid_amount?: number | null
          payment_status?: string
          payment_method?: string | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          attachment_url?: string | null
          branch_id?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          purchase_number?: string
          supplier_id?: string | null
          purchase_date?: string
          status?: string
          subtotal?: number
          tax?: number | null
          discount?: number | null
          total?: number
          paid_amount?: number | null
          payment_status?: string
          payment_method?: string | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          attachment_url?: string | null
          branch_id?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          role_id: string
          permission_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          role_id: string
          permission_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          role_id?: string
          permission_id?: string
          created_at?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          id: string
          name: string
          name_ar: string
          description: string | null
          description_ar: string | null
          is_system_role: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          name_ar: string
          description?: string | null
          description_ar?: string | null
          is_system_role?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          name_ar?: string
          description?: string | null
          description_ar?: string | null
          is_system_role?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      salary_payments: {
        Row: {
          id: string
          employee_id: string
          branch_id: string
          payment_date: string | null
          period_start: string
          period_end: string
          basic_amount: number | null
          commission_amount: number | null
          bonus: number | null
          deductions: number | null
          total_amount: number
          payment_method: string | null
          notes: string | null
          created_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          branch_id: string
          payment_date?: string | null
          period_start: string
          period_end: string
          basic_amount?: number | null
          commission_amount?: number | null
          bonus?: number | null
          deductions?: number | null
          total_amount: number
          payment_method?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          branch_id?: string
          payment_date?: string | null
          period_start?: string
          period_end?: string
          basic_amount?: number | null
          commission_amount?: number | null
          bonus?: number | null
          deductions?: number | null
          total_amount?: number
          payment_method?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      sale_item_materials: {
        Row: {
          id: string
          sale_item_id: string
          material_id: string
          quantity: number
          cost_per_unit: number
          total_cost: number
          created_at: string | null
        }
        Insert: {
          id?: string
          sale_item_id: string
          material_id: string
          quantity?: number
          cost_per_unit?: number
          total_cost?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          sale_item_id?: string
          material_id?: string
          quantity?: number
          cost_per_unit?: number
          total_cost?: number
          created_at?: string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          discount: number | null
          total: number
          created_at: string | null
          purchase_price: number
          is_deleted: boolean
          version: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          discount?: number | null
          total: number
          created_at?: string | null
          purchase_price?: number
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          sale_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          discount?: number | null
          total?: number
          created_at?: string | null
          purchase_price?: number
          is_deleted?: boolean
          version?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          id: string
          sale_number: string
          customer_id: string | null
          sale_date: string
          status: string
          subtotal: number
          tax: number | null
          discount: number | null
          total: number
          paid_amount: number | null
          payment_status: string
          payment_method: string | null
          notes: string | null
          notes_ar: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_charge: number
          delivery_address: string | null
          card_message: string | null
          source: string
          salla_order_id: string | null
          salla_shipping_cost: number | null
          salla_payment_gateway_fee: number | null
          total_cost: number
          gross_profit: number
          profit_margin: number
          branch_id: string | null
          is_deleted: boolean | null
          deleted_at: string | null
          version: number | null
          salesperson_id: string | null
          sale_channel: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          sale_number: string
          customer_id?: string | null
          sale_date?: string
          status?: string
          subtotal?: number
          tax?: number | null
          discount?: number | null
          total?: number
          paid_amount?: number | null
          payment_status?: string
          payment_method?: string | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_charge?: number
          delivery_address?: string | null
          card_message?: string | null
          source?: string
          salla_order_id?: string | null
          salla_shipping_cost?: number | null
          salla_payment_gateway_fee?: number | null
          total_cost?: number
          gross_profit?: number
          profit_margin?: number
          branch_id?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number | null
          salesperson_id?: string | null
          sale_channel?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          sale_number?: string
          customer_id?: string | null
          sale_date?: string
          status?: string
          subtotal?: number
          tax?: number | null
          discount?: number | null
          total?: number
          paid_amount?: number | null
          payment_status?: string
          payment_method?: string | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_charge?: number
          delivery_address?: string | null
          card_message?: string | null
          source?: string
          salla_order_id?: string | null
          salla_shipping_cost?: number | null
          salla_payment_gateway_fee?: number | null
          total_cost?: number
          gross_profit?: number
          profit_margin?: number
          branch_id?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
          version?: number | null
          salesperson_id?: string | null
          sale_channel?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      salla_order_items: {
        Row: {
          id: string
          salla_order_id: string
          product_id: string | null
          salla_product_id: string | null
          product_name: string
          product_name_ar: string | null
          quantity: number
          unit_price: number
          total: number | null
          created_at: string
        }
        Insert: {
          id?: string
          salla_order_id: string
          product_id?: string | null
          salla_product_id?: string | null
          product_name: string
          product_name_ar?: string | null
          quantity: number
          unit_price: number
          total?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          salla_order_id?: string
          product_id?: string | null
          salla_product_id?: string | null
          product_name?: string
          product_name_ar?: string | null
          quantity?: number
          unit_price?: number
          total?: number | null
          created_at?: string
        }
        Relationships: []
      }
      salla_orders: {
        Row: {
          id: string
          salla_order_id: string
          order_number: string
          customer_name: string
          customer_phone: string | null
          customer_email: string | null
          status: string
          subtotal: number
          tax: number
          shipping: number
          total: number
          payment_method: string | null
          payment_status: string | null
          shipping_address: string | null
          shipping_city: string | null
          notes: string | null
          order_date: string
          synced: boolean | null
          synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salla_order_id: string
          order_number: string
          customer_name: string
          customer_phone?: string | null
          customer_email?: string | null
          status?: string
          subtotal?: number
          tax?: number
          shipping?: number
          total?: number
          payment_method?: string | null
          payment_status?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          notes?: string | null
          order_date: string
          synced?: boolean | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salla_order_id?: string
          order_number?: string
          customer_name?: string
          customer_phone?: string | null
          customer_email?: string | null
          status?: string
          subtotal?: number
          tax?: number
          shipping?: number
          total?: number
          payment_method?: string | null
          payment_status?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          notes?: string | null
          order_date?: string
          synced?: boolean | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: number
          salla_api_key: string | null
          created_at: string
          updated_at: string
          business_whatsapp: string | null
          tax_rate: number
          sms_api_key: string | null
          sms_sender_id: string | null
          sms_provider_url: string | null
          sms_provider_name: string | null
          sms_enabled: boolean | null
          ai_enabled: boolean | null
          ai_api_key: string | null
          ai_model: string | null
          ai_provider: string | null
          google_drive_enabled: boolean | null
          google_drive_folder_id: string | null
          google_drive_credentials: Json | null
          auto_backup_enabled: boolean | null
          auto_backup_schedule: string | null
          last_backup_date: string | null
          google_drive_client_id: string | null
          google_drive_client_secret: string | null
        }
        Insert: {
          id?: number
          salla_api_key?: string | null
          created_at?: string
          updated_at?: string
          business_whatsapp?: string | null
          tax_rate?: number
          sms_api_key?: string | null
          sms_sender_id?: string | null
          sms_provider_url?: string | null
          sms_provider_name?: string | null
          sms_enabled?: boolean | null
          ai_enabled?: boolean | null
          ai_api_key?: string | null
          ai_model?: string | null
          ai_provider?: string | null
          google_drive_enabled?: boolean | null
          google_drive_folder_id?: string | null
          google_drive_credentials?: Json | null
          auto_backup_enabled?: boolean | null
          auto_backup_schedule?: string | null
          last_backup_date?: string | null
          google_drive_client_id?: string | null
          google_drive_client_secret?: string | null
        }
        Update: {
          id?: number
          salla_api_key?: string | null
          created_at?: string
          updated_at?: string
          business_whatsapp?: string | null
          tax_rate?: number
          sms_api_key?: string | null
          sms_sender_id?: string | null
          sms_provider_url?: string | null
          sms_provider_name?: string | null
          sms_enabled?: boolean | null
          ai_enabled?: boolean | null
          ai_api_key?: string | null
          ai_model?: string | null
          ai_provider?: string | null
          google_drive_enabled?: boolean | null
          google_drive_folder_id?: string | null
          google_drive_credentials?: Json | null
          auto_backup_enabled?: boolean | null
          auto_backup_schedule?: string | null
          last_backup_date?: string | null
          google_drive_client_id?: string | null
          google_drive_client_secret?: string | null
        }
        Relationships: []
      }
      setup_expenses: {
        Row: {
          id: string
          branch_id: string | null
          category: string
          description: string
          amount: number
          expense_date: string
          supplier_id: string | null
          payment_method: string | null
          receipt_number: string | null
          attachment: string | null
          is_amortizable: boolean | null
          amortization_months: number | null
          notes: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          partner_id: string | null
          description_ar: string | null
          expense_type: string | null
          is_deleted: boolean
          version: number
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          branch_id?: string | null
          category: string
          description: string
          amount: number
          expense_date?: string
          supplier_id?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          attachment?: string | null
          is_amortizable?: boolean | null
          amortization_months?: number | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          partner_id?: string | null
          description_ar?: string | null
          expense_type?: string | null
          is_deleted?: boolean
          version?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          branch_id?: string | null
          category?: string
          description?: string
          amount?: number
          expense_date?: string
          supplier_id?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          attachment?: string | null
          is_amortizable?: boolean | null
          amortization_months?: number | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          partner_id?: string | null
          description_ar?: string | null
          expense_type?: string | null
          is_deleted?: boolean
          version?: number
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          id: string
          recipient_phone: string
          recipient_name: string | null
          message_body: string
          status: string
          provider_message_id: string | null
          error_message: string | null
          sent_by: string | null
          cost: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          recipient_phone: string
          recipient_name?: string | null
          message_body: string
          status?: string
          provider_message_id?: string | null
          error_message?: string | null
          sent_by?: string | null
          cost?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          recipient_phone?: string
          recipient_name?: string | null
          message_body?: string
          status?: string
          provider_message_id?: string | null
          error_message?: string | null
          sent_by?: string | null
          cost?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          id: string
          payment_number: string
          supplier_id: string
          amount: number
          payment_method: string
          payment_date: string
          reference: string | null
          notes: string | null
          created_by: string | null
          created_at: string | null
          is_deleted: boolean | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          payment_number: string
          supplier_id: string
          amount?: number
          payment_method?: string
          payment_date?: string
          reference?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          payment_number?: string
          supplier_id?: string
          amount?: number
          payment_method?: string
          payment_date?: string
          reference?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          is_deleted?: boolean | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string
          code: string
          name: string
          name_ar: string | null
          email: string | null
          phone: string | null
          address: string | null
          address_ar: string | null
          city: string | null
          city_ar: string | null
          country: string | null
          country_ar: string | null
          notes: string | null
          notes_ar: string | null
          current_balance: number | null
          is_active: boolean | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          tax_number: string | null
        }
        Insert: {
          id?: string
          code: string
          name: string
          name_ar?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          address_ar?: string | null
          city?: string | null
          city_ar?: string | null
          country?: string | null
          country_ar?: string | null
          notes?: string | null
          notes_ar?: string | null
          current_balance?: number | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          tax_number?: string | null
        }
        Update: {
          id?: string
          code?: string
          name?: string
          name_ar?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          address_ar?: string | null
          city?: string | null
          city_ar?: string | null
          country?: string | null
          country_ar?: string | null
          notes?: string | null
          notes_ar?: string | null
          current_balance?: number | null
          is_active?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          tax_number?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          transaction_number: string
          transaction_date: string
          type: string
          account_id: string | null
          reference_type: string | null
          reference_id: string | null
          amount: number
          description: string | null
          description_ar: string | null
          created_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          transaction_number: string
          transaction_date?: string
          type: string
          account_id?: string | null
          reference_type?: string | null
          reference_id?: string | null
          amount: number
          description?: string | null
          description_ar?: string | null
          created_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          transaction_number?: string
          transaction_date?: string
          type?: string
          account_id?: string | null
          reference_type?: string | null
          reference_id?: string | null
          amount?: number
          description?: string | null
          description_ar?: string | null
          created_by?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          full_name: string
          role: string
          is_active: boolean
          created_at: string
          updated_at: string
          permissions: Json | null
          branch_id: string | null
        }
        Insert: {
          id: string
          full_name: string
          role: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
          permissions?: Json | null
          branch_id?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          role?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
          permissions?: Json | null
          branch_id?: string | null
        }
        Relationships: []
      }
      wastage: {
        Row: {
          id: string
          wastage_number: string
          product_id: string
          quantity: number
          unit_cost: number
          total_cost: number | null
          reason: string
          reason_ar: string | null
          notes: string | null
          recorded_by: string
          recorded_at: string
          created_at: string
        }
        Insert: {
          id?: string
          wastage_number: string
          product_id: string
          quantity: number
          unit_cost?: number
          total_cost?: number | null
          reason: string
          reason_ar?: string | null
          notes?: string | null
          recorded_by: string
          recorded_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          wastage_number?: string
          product_id?: string
          quantity?: number
          unit_cost?: number
          total_cost?: number | null
          reason?: string
          reason_ar?: string | null
          notes?: string | null
          recorded_by?: string
          recorded_at?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: Record<string, never>
        Returns: string
      }
      get_user_role: {
        Args: Record<string, never>
        Returns: string
      }
      get_user_branch_id: {
        Args: Record<string, never>
        Returns: string
      }
      is_super_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      generate_expense_number: {
        Args: Record<string, never>
        Returns: string
      }
      generate_journal_entry_number: {
        Args: Record<string, never>
        Returns: string
      }
      generate_shift_number: {
        Args: Record<string, never>
        Returns: string
      }
      generate_wastage_number: {
        Args: Record<string, never>
        Returns: string
      }
      update_sale_status: {
        Args: {
          p_sale_id: string
          p_new_status: string
          p_reason?: string
        }
        Returns: Json
      }
      update_purchase_status: {
        Args: {
          p_purchase_id: string
          p_new_status: string
          p_reason?: string
        }
        Returns: Json
      }
      void_sale: {
        Args: {
          p_sale_id: string
          p_reason?: string
        }
        Returns: Json
      }
      void_purchase: {
        Args: {
          p_purchase_id: string
          p_reason?: string
        }
        Returns: Json
      }
      void_expense: {
        Args: {
          p_expense_id: string
          p_reason?: string
        }
        Returns: Json
      }
      void_operating_expense: {
        Args: {
          p_expense_id: string
          p_reason?: string
        }
        Returns: Json
      }
      void_setup_expense: {
        Args: {
          p_expense_id: string
          p_reason?: string
        }
        Returns: Json
      }
      void_partner_settlement: {
        Args: {
          p_settlement_id: string
          p_void_reason: string
        }
        Returns: undefined
      }
      void_journal_entry: {
        Args: {
          p_journal_entry_id: string
        }
        Returns: string
      }
      execute_sql_as_admin: {
        Args: {
          sql_query: string
        }
        Returns: number
      }
      calculate_sale_profit: {
        Args: {
          sale_id_param: string
        }
        Returns: undefined
      }
      calculate_valid_loyalty_points: {
        Args: {
          p_customer_id: string
        }
        Returns: number
      }
      recalculate_all_customer_metrics: {
        Args: Record<string, never>
        Returns: undefined
      }
      recalculate_all_valid_loyalty_points: {
        Args: Record<string, never>
        Returns: undefined
      }
      update_customer_classification_tags: {
        Args: Record<string, never>
        Returns: undefined
      }
      fix_customer_metrics_for_existing_data: {
        Args: Record<string, never>
        Returns: undefined
      }
      create_sale_journal_entry: {
        Args: {
          p_sale_id: string
        }
        Returns: string
      }
      create_purchase_receipt_journal_entry: {
        Args: {
          p_receipt_id: string
        }
        Returns: string
      }
      create_payroll_run: {
        Args: {
          p_year: number
          p_month: number
          p_branch_id?: string
          p_created_by?: string
        }
        Returns: string
      }
      assign_branch_to_user: {
        Args: {
          p_user_id: string
          p_branch_id: string
        }
        Returns: undefined
      }
      add_loyalty_points_transaction: {
        Args: {
          p_customer_id: string
          p_sale_id: string
          p_points: number
          p_description?: string
        }
        Returns: string
      }
      trusted_change_sale_status: {
        Args: {
          p_sale_id: string
          p_new_status: string
          p_reason: string
        }
        Returns: undefined
      }
      trusted_change_purchase_status: {
        Args: {
          p_purchase_id: string
          p_new_status: string
          p_reason: string
        }
        Returns: undefined
      }
      trusted_void_sale: {
        Args: {
          p_sale_id: string
          p_reason: string
        }
        Returns: undefined
      }
      trusted_void_purchase: {
        Args: {
          p_purchase_id: string
          p_reason: string
        }
        Returns: undefined
      }
      trusted_void_expense: {
        Args: {
          p_expense_id: string
          p_reason: string
        }
        Returns: undefined
      }
      trusted_void_operating_expense: {
        Args: {
          p_expense_id: string
          p_reason: string
        }
        Returns: undefined
      }
      trusted_void_setup_expense: {
        Args: {
          p_expense_id: string
          p_reason: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
