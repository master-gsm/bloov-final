export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          full_name_ar: string | null
          role_id: string | null
          language: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          full_name_ar?: string | null
          role_id?: string | null
          language?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          full_name_ar?: string | null
          role_id?: string | null
          language?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      partners: {
        Row: {
          id: string
          name: string
          name_ar: string
          share_percentage: number
          email: string | null
          phone: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          name_ar: string
          share_percentage: number
          email?: string | null
          phone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          name_ar?: string
          share_percentage?: number
          email?: string | null
          phone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
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
          type: 'natural' | 'artificial' | 'preserved' | 'greenery' | 'indoor_plants' | 'dried'
          classification: 'ready_bouquets' | 'vases' | 'gifts' | 'wrapping' | 'cards' | 'services' | 'vases_glass' | 'wrapping_paper' | 'ribbons' | 'floral_tools' | 'gift_boxes' | null
          unit: string
          unit_ar: string
          purchase_price: number
          sale_price: number
          min_stock_level: number
          image_url: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sku: string
          name: string
          name_ar: string
          description?: string | null
          description_ar?: string | null
          category_id?: string | null
          type: 'natural' | 'artificial' | 'preserved' | 'greenery' | 'indoor_plants' | 'dried'
          classification?: 'ready_bouquets' | 'vases' | 'gifts' | 'wrapping' | 'cards' | 'services' | 'vases_glass' | 'wrapping_paper' | 'ribbons' | 'floral_tools' | 'gift_boxes' | null
          unit?: string
          unit_ar?: string
          purchase_price?: number
          sale_price?: number
          min_stock_level?: number
          image_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sku?: string
          name?: string
          name_ar?: string
          description?: string | null
          description_ar?: string | null
          category_id?: string | null
          type?: 'natural' | 'artificial' | 'preserved' | 'greenery' | 'indoor_plants' | 'dried'
          classification?: 'ready_bouquets' | 'vases' | 'gifts' | 'wrapping' | 'cards' | 'services' | 'vases_glass' | 'wrapping_paper' | 'ribbons' | 'floral_tools' | 'gift_boxes' | null
          unit?: string
          unit_ar?: string
          purchase_price?: number
          sale_price?: number
          min_stock_level?: number
          image_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          sale_number: string
          customer_id: string | null
          sale_date: string
          status: 'draft' | 'confirmed' | 'cancelled'
          subtotal: number
          tax: number
          discount: number
          total: number
          total_cost: number
          gross_profit: number
          profit_margin: number
          paid_amount: number
          payment_status: 'unpaid' | 'partial' | 'paid'
          payment_method: 'cash' | 'card' | 'transfer' | 'check' | null
          notes: string | null
          notes_ar: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sale_number: string
          customer_id?: string | null
          sale_date?: string
          status?: 'draft' | 'confirmed' | 'cancelled'
          subtotal?: number
          tax?: number
          discount?: number
          total?: number
          total_cost?: number
          gross_profit?: number
          profit_margin?: number
          paid_amount?: number
          payment_status?: 'unpaid' | 'partial' | 'paid'
          payment_method?: 'cash' | 'card' | 'transfer' | 'check' | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sale_number?: string
          customer_id?: string | null
          sale_date?: string
          status?: 'draft' | 'confirmed' | 'cancelled'
          subtotal?: number
          tax?: number
          discount?: number
          total?: number
          total_cost?: number
          gross_profit?: number
          profit_margin?: number
          paid_amount?: number
          payment_status?: 'unpaid' | 'partial' | 'paid'
          payment_method?: 'cash' | 'card' | 'transfer' | 'check' | null
          notes?: string | null
          notes_ar?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      product_recipes: {
        Row: {
          id: string
          product_id: string
          material_id: string
          quantity: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          material_id: string
          quantity?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          material_id?: string
          quantity?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      sale_item_materials: {
        Row: {
          id: string
          sale_item_id: string
          material_id: string
          quantity: number
          cost_per_unit: number
          total_cost: number
          created_at: string
        }
        Insert: {
          id?: string
          sale_item_id: string
          material_id: string
          quantity?: number
          cost_per_unit?: number
          total_cost?: number
          created_at?: string
        }
        Update: {
          id?: string
          sale_item_id?: string
          material_id?: string
          quantity?: number
          cost_per_unit?: number
          total_cost?: number
          created_at?: string
        }
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
  }
}
