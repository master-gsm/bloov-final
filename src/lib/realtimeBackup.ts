import { supabase } from './supabase';

/**
 * نظام النسخ الاحتياطي اللحظي
 * Real-time Backup System
 *
 * يقوم بإضافة العمليات إلى قائمة الانتظار للنسخ الاحتياطي الفوري
 */

interface BackupQueueItem {
  table_name: string;
  operation: 'insert' | 'update' | 'delete';
  record_id: string;
  data?: any;
}

/**
 * إضافة عملية إلى قائمة انتظار النسخ الاحتياطي
 */
async function addToBackupQueue(item: BackupQueueItem): Promise<void> {
  try {
    // التحقق من تفعيل النسخ اللحظي
    const { data: settings } = await supabase
      .from('backup_settings')
      .select('realtime_backup_enabled, google_drive_enabled')
      .single();

    if (!settings?.realtime_backup_enabled || !settings?.google_drive_enabled) {
      // النسخ اللحظي غير مفعل
      return;
    }

    // إضافة إلى قائمة الانتظار
    await supabase
      .from('backup_queue')
      .insert({
        table_name: item.table_name,
        operation: item.operation,
        record_id: item.record_id,
        data: item.data || null,
        processed: false,
      });

    // تشغيل معالجة القائمة في الخلفية
    processBackupQueue().catch(console.error);
  } catch (error) {
    console.error('Error adding to backup queue:', error);
    // لا نريد أن يفشل العملية الأساسية بسبب النسخ الاحتياطي
  }
}

/**
 * معالجة قائمة انتظار النسخ الاحتياطي
 */
async function processBackupQueue(): Promise<void> {
  try {
    // الحصول على token المستخدم الحالي
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // لا يوجد مستخدم مسجل دخول، نتجاهل
      return;
    }

    // جلب العناصر غير المعالجة (آخر 100)
    const { data: queue } = await supabase
      .from('backup_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!queue || queue.length === 0) {
      return;
    }

    // تجميع البيانات حسب الجدول
    const groupedData: Record<string, any[]> = {};

    for (const item of queue) {
      if (!groupedData[item.table_name]) {
        groupedData[item.table_name] = [];
      }
      groupedData[item.table_name].push(item);
    }

    // إرسال إلى Edge Function للنسخ باستخدام supabase.functions.invoke
    const { data, error } = await supabase.functions.invoke('google-drive-backup', {
      body: {
        backupType: 'incremental',
        tables: Object.keys(groupedData),
      },
    });

    if (!error && data && data.success !== false) {
      // تحديد العناصر كمعالجة
      const queueIds = queue.map(item => item.id);
      await supabase
        .from('backup_queue')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .in('id', queueIds);
    }
  } catch (error) {
    console.error('Error processing backup queue:', error);
  }
}

/**
 * Hook للاستخدام بعد إنشاء سجل
 */
export async function afterCreate(tableName: string, recordId: string, data?: any): Promise<void> {
  await addToBackupQueue({
    table_name: tableName,
    operation: 'insert',
    record_id: recordId,
    data,
  });
}

/**
 * Hook للاستخدام بعد تحديث سجل
 */
export async function afterUpdate(tableName: string, recordId: string, data?: any): Promise<void> {
  await addToBackupQueue({
    table_name: tableName,
    operation: 'update',
    record_id: recordId,
    data,
  });
}

/**
 * Hook للاستخدام بعد حذف سجل
 */
export async function afterDelete(tableName: string, recordId: string): Promise<void> {
  await addToBackupQueue({
    table_name: tableName,
    operation: 'delete',
    record_id: recordId,
  });
}

/**
 * تشغيل نسخ احتياطي كامل الآن
 */
export async function triggerFullBackup(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[Backup] Starting full backup...');

    // الحصول على session للـ JWT token
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.access_token) {
      throw new Error('يجب تسجيل الدخول لإجراء النسخ الاحتياطي');
    }

    console.log('[Backup] Session exists, invoking edge function...');

    // استخدام supabase.functions.invoke لإرسال JWT تلقائياً
    const { data, error } = await supabase.functions.invoke('google-drive-backup', {
      body: {
        backupType: 'full',
      },
    });

    console.log('[Backup] Response data:', data);
    console.log('[Backup] Response error:', error);

    // التعامل مع الأخطاء من FunctionInvokeError
    if (error) {
      // إذا كان هناك context (response body)، حاول استخراج الرسالة
      const errorMessage = error.message || 'فشل في إنشاء النسخة الاحتياطية';
      console.error('[Backup] Function error:', errorMessage);

      // رسائل خطأ واضحة
      if (errorMessage.includes('Google Drive not enabled') || errorMessage.includes('not configured')) {
        throw new Error('Google Drive غير مفعّل. الرجاء تفعيله من الإعدادات أولاً');
      }

      throw new Error(errorMessage);
    }

    // التحقق من نجاح العملية
    if (data && data.success !== false) {
      const recordCount = data.record_count || 0;
      return {
        success: true,
        message: data.google_drive_url
          ? `تم رفع النسخة الاحتياطية إلى Google Drive بنجاح (${recordCount} سجل)`
          : `تم إنشاء النسخة الاحتياطية بنجاح (${recordCount} سجل)`,
      };
    } else {
      // data موجودة ولكن success = false
      const errorMsg = data?.error || 'فشل في إنشاء النسخة الاحتياطية';
      console.error('[Backup] Function returned error:', errorMsg);

      if (errorMsg.includes('Google Drive not enabled') || errorMsg.includes('not configured')) {
        throw new Error('Google Drive غير مفعّل. الرجاء تفعيله من الإعدادات أولاً');
      }

      throw new Error(errorMsg);
    }
  } catch (error: any) {
    console.error('[Backup] Error:', error);
    return {
      success: false,
      message: error.message || 'حدث خطأ أثناء إنشاء النسخة الاحتياطية',
    };
  }
}

/**
 * نسخ احتياطي للصور إلى Google Drive
 */
export async function backupImageToGoogleDrive(
  imageUrl: string,
  fileName: string,
  type: 'invoice' | 'receipt'
): Promise<void> {
  try {
    // التحقق من تفعيل النسخ اللحظي
    const { data: settings } = await supabase
      .from('backup_settings')
      .select('realtime_backup_enabled, google_drive_enabled')
      .single();

    if (!settings?.realtime_backup_enabled || !settings?.google_drive_enabled) {
      return;
    }

    // تحميل الصورة من Storage
    const bucketName = type === 'invoice' ? 'invoices' : 'receipts';
    const { data: imageData, error } = await supabase
      .storage
      .from(bucketName)
      .download(fileName);

    if (error || !imageData) {
      console.error('Failed to download image for backup:', error);
      return;
    }

    // تسجيل في قائمة الانتظار للصور
    await supabase
      .from('backup_queue')
      .insert({
        table_name: 'storage_' + bucketName,
        operation: 'insert',
        record_id: fileName,
        data: {
          url: imageUrl,
          type,
          size: imageData.size,
        },
        processed: false,
      });

    // ملاحظة: سيتم معالجة رفع الصور بواسطة cron job منفصل
  } catch (error) {
    console.error('Error backing up image:', error);
  }
}

/**
 * فحص صحة النسخ الاحتياطي
 */
export async function checkBackupHealth(): Promise<{
  status: 'healthy' | 'warning' | 'critical' | 'never_backed_up';
  last_backup_at: string | null;
  hours_since_backup: number | null;
  failed_backups_24h: number;
  google_drive_enabled: boolean;
  realtime_enabled: boolean;
}> {
  try {
    const { data, error } = await supabase
      .rpc('check_backup_health');

    if (error) {
      console.error('Error checking backup health:', error);
      return {
        status: 'critical',
        last_backup_at: null,
        hours_since_backup: null,
        failed_backups_24h: 0,
        google_drive_enabled: false,
        realtime_enabled: false,
      };
    }

    return data;
  } catch (error) {
    console.error('Error checking backup health:', error);
    return {
      status: 'critical',
      last_backup_at: null,
      hours_since_backup: null,
      failed_backups_24h: 0,
      google_drive_enabled: false,
      realtime_enabled: false,
    };
  }
}

/**
 * جلب آخر 10 سجلات نسخ احتياطي
 */
export async function getRecentBackupLogs(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('backup_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching backup logs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching backup logs:', error);
    return [];
  }
}

/**
 * تنظيف النسخ الاحتياطية القديمة
 */
export async function cleanupOldBackups(): Promise<{ deletedCount: number }> {
  try {
    const { data, error } = await supabase
      .rpc('cleanup_old_backups');

    if (error) {
      console.error('Error cleaning up old backups:', error);
      return { deletedCount: 0 };
    }

    return { deletedCount: data || 0 };
  } catch (error) {
    console.error('Error cleaning up old backups:', error);
    return { deletedCount: 0 };
  }
}
