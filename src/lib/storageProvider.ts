/**
 * Storage Provider - نظام موحد للتخزين
 * يدعم Supabase Storage و Google Drive
 */

import * as supabaseStorage from './fileUpload';
import { getGoogleDriveInstance } from './googleDriveStorage';

export type StorageProvider = 'supabase' | 'googledrive';

// قراءة مزود التخزين من localStorage أو استخدام الافتراضي
let currentProvider: StorageProvider =
  (localStorage.getItem('storageProvider') as StorageProvider) || 'supabase';

/**
 * تعيين مزود التخزين
 */
export const setStorageProvider = (provider: StorageProvider): void => {
  currentProvider = provider;
  localStorage.setItem('storageProvider', provider);
};

/**
 * الحصول على مزود التخزين الحالي
 */
export const getStorageProvider = (): StorageProvider => {
  return currentProvider;
};

/**
 * رفع ملف باستخدام المزود المحدد
 */
export const uploadFile = async (file: File, folder: string): Promise<string | null> => {
  try {
    if (currentProvider === 'googledrive') {
      const googleDrive = getGoogleDriveInstance();
      if (!googleDrive) {
        console.error('Google Drive not initialized');
        return null;
      }
      return await googleDrive.uploadFile(file, folder);
    } else {
      return await supabaseStorage.uploadFile(file, folder);
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    return null;
  }
};

/**
 * الحصول على رابط الملف
 */
export const getFileUrl = async (filePath: string): Promise<string> => {
  try {
    if (currentProvider === 'googledrive') {
      const googleDrive = getGoogleDriveInstance();
      if (!googleDrive) {
        return '';
      }
      return await googleDrive.getFileUrl(filePath);
    } else {
      return supabaseStorage.getFileUrl(filePath);
    }
  } catch (error) {
    console.error('Error getting file URL:', error);
    return '';
  }
};

/**
 * تحميل الملف
 */
export const downloadFile = async (filePath: string): Promise<Blob | null> => {
  try {
    if (currentProvider === 'googledrive') {
      const googleDrive = getGoogleDriveInstance();
      if (!googleDrive) {
        return null;
      }
      return await googleDrive.downloadFile(filePath);
    } else {
      return await supabaseStorage.downloadFile(filePath);
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    return null;
  }
};

/**
 * حذف الملف
 */
export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    if (currentProvider === 'googledrive') {
      const googleDrive = getGoogleDriveInstance();
      if (!googleDrive) {
        return false;
      }
      return await googleDrive.deleteFile(filePath);
    } else {
      return await supabaseStorage.deleteFile(filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

/**
 * التحقق من حالة الاتصال بمزود التخزين
 */
export const isStorageConnected = async (): Promise<boolean> => {
  try {
    if (currentProvider === 'googledrive') {
      const googleDrive = getGoogleDriveInstance();
      return googleDrive ? googleDrive.isConnected() : false;
    } else {
      // التحقق من اتصال Supabase
      return await supabaseStorage.ensureBucketExists();
    }
  } catch (error) {
    console.error('Error checking storage connection:', error);
    return false;
  }
};

/**
 * الحصول على رابط موقع مؤقت (فقط لـ Supabase)
 */
export const getSignedUrl = async (
  filePath: string,
  expiresIn = 3600
): Promise<string | null> => {
  if (currentProvider === 'googledrive') {
    // Google Drive يستخدم روابط دائمة
    return await getFileUrl(filePath);
  } else {
    return await supabaseStorage.getSignedUrl(filePath, expiresIn);
  }
};
