import { supabase } from './supabase';
import { indexedDBManager } from './offline/indexedDBManager';

interface SalePayload {
  id: string;
  branch_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  sale_number: string;
  sale_date: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string;
  delivery_charge: number;
  delivery_address: string | null;
  card_message: string | null;
  notes: string | null;
  source: string;
  salla_shipping_cost: number;
  salla_payment_gateway_fee: number;
  salesperson_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SaleItemPayload {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  purchase_price: number;
  discount: number;
  total: number;
  created_at: string;
}

export class HybridSalesWrite {
  /**
   * ONLINE PATH: Direct insert to Supabase + cache
   * OFFLINE PATH: Queue only
   */
  static async createSale(
    isOnline: boolean,
    salePayload: SalePayload,
    saleItems: SaleItemPayload[]
  ): Promise<{
    success: boolean;
    saleId: string;
    status: 'confirmed' | 'draft';
    invoiceNumber: string | null;
    mode: 'online' | 'offline';
    error?: string;
  }> {
    try {
      if (isOnline) {
        console.log('[HybridSalesWrite] ONLINE MODE: Direct insert to server');
        return await this.createSaleOnline(salePayload, saleItems);
      } else {
        console.log('[HybridSalesWrite] OFFLINE MODE: Queue only');
        return await this.createSaleOffline(salePayload, saleItems);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[HybridSalesWrite] Sale creation failed:', errorMessage);
      return {
        success: false,
        saleId: salePayload.id,
        status: 'draft',
        invoiceNumber: null,
        mode: isOnline ? 'online' : 'offline',
        error: errorMessage,
      };
    }
  }

  private static async createSaleOnline(
    salePayload: SalePayload,
    saleItems: SaleItemPayload[]
  ): Promise<{
    success: boolean;
    saleId: string;
    status: 'confirmed' | 'draft';
    invoiceNumber: string | null;
    mode: 'online';
    error?: string;
  }> {
    try {
      // 1. Insert sale directly to server
      console.log(`[HybridSalesWrite.Online] Inserting sale ${salePayload.id} to server...`);
      const { data: saleResponse, error: saleError } = await supabase
        .from('sales')
        .insert([salePayload])
        .select('*')
        .maybeSingle();

      if (saleError) {
        console.error('[HybridSalesWrite.Online] Sale insert failed:', saleError);
        throw new Error(`Sale insert failed: ${saleError.message}`);
      }

      if (!saleResponse) {
        throw new Error('No response from server after sale insert');
      }

      console.log(`[HybridSalesWrite.Online] Sale inserted: id=${saleResponse.id}, status=${saleResponse.status}, invoice_number=${saleResponse.invoice_number}`);

      // 2. Fetch fresh sale to get generated invoice_number
      let finalSale = saleResponse;
      if (!saleResponse.invoice_number) {
        console.log(`[HybridSalesWrite.Online] No invoice_number in response, fetching fresh record...`);
        const { data: freshSale, error: fetchError } = await supabase
          .from('sales')
          .select('*')
          .eq('id', saleResponse.id)
          .maybeSingle();

        if (fetchError) {
          console.warn('[HybridSalesWrite.Online] Fresh fetch failed:', fetchError);
        } else if (freshSale) {
          finalSale = freshSale;
          console.log(`[HybridSalesWrite.Online] Fresh sale loaded: invoice_number=${freshSale.invoice_number}`);
        }
      }

      // 3. Insert sale items in batch
      if (saleItems.length > 0) {
        console.log(`[HybridSalesWrite.Online] Inserting ${saleItems.length} sale items...`);
        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) {
          console.error('[HybridSalesWrite.Online] Sale items insert failed:', itemsError);
          throw new Error(`Sale items insert failed: ${itemsError.message}`);
        }
      }

      // 4. Confirm sale if still draft
      let confirmedSale = finalSale;
      if (finalSale.status === 'draft') {
        console.log(`[HybridSalesWrite.Online] Sale is draft, confirming...`);
        const { data: confirmed, error: confirmError } = await supabase
          .from('sales')
          .update({
            status: 'confirmed',
            invoice_number: finalSale.invoice_number || finalSale.sale_number,
            updated_at: new Date().toISOString(),
          })
          .eq('id', finalSale.id)
          .select('*')
          .maybeSingle();

        if (confirmError) {
          console.error('[HybridSalesWrite.Online] Confirmation failed:', confirmError);
        } else if (confirmed) {
          confirmedSale = confirmed;
          console.log(`[HybridSalesWrite.Online] Sale confirmed: status=${confirmed.status}, invoice_number=${confirmed.invoice_number}`);
        }
      }

      // 5. Cache in IndexedDB
      console.log('[HybridSalesWrite.Online] Caching sale and items in IndexedDB...');
      await indexedDBManager.cacheRecord('sales', confirmedSale, true);
      for (const item of saleItems) {
        await indexedDBManager.cacheRecord('sale_items', item, true);
      }

      return {
        success: true,
        saleId: confirmedSale.id,
        status: confirmedSale.status === 'confirmed' ? 'confirmed' : 'draft',
        invoiceNumber: confirmedSale.invoice_number || confirmedSale.sale_number,
        mode: 'online',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[HybridSalesWrite.Online] Exception:', errorMessage);
      throw error;
    }
  }

  private static async createSaleOffline(
    salePayload: SalePayload,
    saleItems: SaleItemPayload[]
  ): Promise<{
    success: boolean;
    saleId: string;
    status: 'draft';
    invoiceNumber: string | null;
    mode: 'offline';
    error?: string;
  }> {
    try {
      // 1. Queue sale insert
      console.log(`[HybridSalesWrite.Offline] Queuing sale ${salePayload.id}...`);
      await indexedDBManager.addOperationToQueue({
        operationId: crypto.randomUUID(),
        table: 'sales',
        operation: 'insert',
        data: salePayload,
        localVersion: Date.now(),
        remoteVersion: null,
        status: 'pending',
        retries: 0,
        maxRetries: 3,
        error: null,
        syncedAt: null,
        serverResponse: null,
      });

      // 2. Queue sale items
      if (saleItems.length > 0) {
        console.log(`[HybridSalesWrite.Offline] Queuing ${saleItems.length} sale items...`);
        for (const item of saleItems) {
          await indexedDBManager.addOperationToQueue({
            operationId: crypto.randomUUID(),
            table: 'sale_items',
            operation: 'insert',
            data: item,
            localVersion: Date.now(),
            remoteVersion: null,
            status: 'pending',
            retries: 0,
            maxRetries: 3,
            error: null,
            syncedAt: null,
            serverResponse: null,
          });
        }
      }

      // 3. Cache locally
      console.log('[HybridSalesWrite.Offline] Caching sale and items in IndexedDB...');
      await indexedDBManager.cacheRecord('sales', salePayload, true);
      for (const item of saleItems) {
        await indexedDBManager.cacheRecord('sale_items', item, true);
      }

      return {
        success: true,
        saleId: salePayload.id,
        status: 'draft',
        invoiceNumber: null,
        mode: 'offline',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[HybridSalesWrite.Offline] Exception:', errorMessage);
      throw error;
    }
  }
}
