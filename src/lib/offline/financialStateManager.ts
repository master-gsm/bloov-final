import { indexedDBManager } from './indexedDBManager';

export interface FinancialState {
  key: 'financial';
  lastCalculationTime: number;
  pendingCommissions: Array<{
    saleId: string;
    employeeId: string;
    amount: number;
    status: 'pending_calculation' | 'calculated' | 'synced';
  }>;
  pendingCashMovements: Array<{
    saleId: string;
    amount: number;
    status: 'pending_movement' | 'recorded' | 'synced';
  }>;
  lockedFor: {
    date: string;
    reason: string;
  } | null;
}

class FinancialStateManager {
  private cache: FinancialState | null = null;

  async getFinancialState(): Promise<FinancialState> {
    if (this.cache) {
      return this.cache;
    }

    try {
      await indexedDBManager.init();
      const state = await (indexedDBManager as any).db?.transaction(['financialState'], 'readonly')
        .objectStore('financialState')
        .get('financial');

      if (state) {
        this.cache = state;
        return state;
      }
    } catch (error) {
      console.warn('[FinancialStateManager] Failed to load state:', error);
    }

    return this.getDefaultState();
  }

  private getDefaultState(): FinancialState {
    return {
      key: 'financial',
      lastCalculationTime: 0,
      pendingCommissions: [],
      pendingCashMovements: [],
      lockedFor: null,
    };
  }

  async updateFinancialState(update: Partial<FinancialState>): Promise<void> {
    const state = await this.getFinancialState();
    const updated = { ...state, ...update, key: 'financial' as const };

    this.cache = updated;

    try {
      await (indexedDBManager as any).db?.transaction(['financialState'], 'readwrite')
        .objectStore('financialState')
        .put(updated);

      console.log('[FinancialStateManager] State updated:', updated);
    } catch (error) {
      console.error('[FinancialStateManager] Failed to update state:', error);
    }
  }

  async canCalculateCommission(saleId: string, employeeId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const state = await this.getFinancialState();

    const pending = state.pendingCommissions.find(
      c => c.saleId === saleId && c.employeeId === employeeId
    );

    if (pending) {
      return {
        allowed: false,
        reason: `Commission already ${pending.status} for this sale and employee`,
      };
    }

    if (state.lockedFor) {
      return {
        allowed: false,
        reason: `Financial period locked: ${state.lockedFor.reason}`,
      };
    }

    return { allowed: true };
  }

  async canRecordCashMovement(saleId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const state = await this.getFinancialState();

    const pending = state.pendingCashMovements.find(m => m.saleId === saleId);

    if (pending) {
      return {
        allowed: false,
        reason: `Cash movement already ${pending.status} for this sale`,
      };
    }

    if (state.lockedFor) {
      return {
        allowed: false,
        reason: `Financial period locked: ${state.lockedFor.reason}`,
      };
    }

    return { allowed: true };
  }

  async registerPendingCommission(
    saleId: string,
    employeeId: string,
    amount: number
  ): Promise<void> {
    const state = await this.getFinancialState();

    const existing = state.pendingCommissions.find(
      c => c.saleId === saleId && c.employeeId === employeeId
    );

    if (!existing) {
      state.pendingCommissions.push({
        saleId,
        employeeId,
        amount,
        status: 'pending_calculation',
      });

      await this.updateFinancialState(state);
    }
  }

  async markCommissionCalculated(saleId: string, employeeId: string): Promise<void> {
    const state = await this.getFinancialState();
    const commission = state.pendingCommissions.find(
      c => c.saleId === saleId && c.employeeId === employeeId
    );

    if (commission) {
      commission.status = 'calculated';
      await this.updateFinancialState(state);
    }
  }

  async markCommissionSynced(saleId: string, employeeId: string): Promise<void> {
    const state = await this.getFinancialState();
    state.pendingCommissions = state.pendingCommissions.filter(
      c => !(c.saleId === saleId && c.employeeId === employeeId)
    );
    await this.updateFinancialState(state);
  }

  async registerPendingCashMovement(saleId: string, amount: number): Promise<void> {
    const state = await this.getFinancialState();

    const existing = state.pendingCashMovements.find(m => m.saleId === saleId);

    if (!existing) {
      state.pendingCashMovements.push({
        saleId,
        amount,
        status: 'pending_movement',
      });

      await this.updateFinancialState(state);
    }
  }

  async markCashMovementRecorded(saleId: string): Promise<void> {
    const state = await this.getFinancialState();
    const movement = state.pendingCashMovements.find(m => m.saleId === saleId);

    if (movement) {
      movement.status = 'recorded';
      await this.updateFinancialState(state);
    }
  }

  async markCashMovementSynced(saleId: string): Promise<void> {
    const state = await this.getFinancialState();
    state.pendingCashMovements = state.pendingCashMovements.filter(
      m => m.saleId !== saleId
    );
    await this.updateFinancialState(state);
  }

  async getPendingFinancialItems(): Promise<{
    pendingCommissions: number;
    pendingCashMovements: number;
  }> {
    const state = await this.getFinancialState();
    return {
      pendingCommissions: state.pendingCommissions.length,
      pendingCashMovements: state.pendingCashMovements.length,
    };
  }

  async lockFinancialPeriod(dateStr: string, reason: string): Promise<void> {
    const state = await this.getFinancialState();
    state.lockedFor = { date: dateStr, reason };
    await this.updateFinancialState(state);
    console.log('[FinancialStateManager] Financial period locked:', { date: dateStr, reason });
  }

  async unlockFinancialPeriod(): Promise<void> {
    const state = await this.getFinancialState();
    state.lockedFor = null;
    await this.updateFinancialState(state);
    console.log('[FinancialStateManager] Financial period unlocked');
  }

  async isFinancialPeriodLocked(): Promise<boolean> {
    const state = await this.getFinancialState();
    return state.lockedFor !== null;
  }
}

export const financialStateManager = new FinancialStateManager();
