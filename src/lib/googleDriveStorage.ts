/**
 * Google Drive Storage Integration
 * يتيح رفع وتحميل الملفات من Google Drive
 */

interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  folderId?: string; // معرف المجلد الذي سيتم التخزين فيه
}

class GoogleDriveStorage {
  private config: GoogleDriveConfig;
  private gapiInited = false;
  private gisInited = false;
  private tokenClient: any;
  private accessToken: string | null = null;

  constructor(config: GoogleDriveConfig) {
    this.config = config;
  }

  /**
   * تهيئة Google Drive API
   */
  async initialize(): Promise<boolean> {
    try {
      // تحميل مكتبات Google API
      await this.loadGoogleAPIs();

      // تهيئة gapi
      await new Promise<void>((resolve) => {
        (window as any).gapi.load('client', async () => {
          await (window as any).gapi.client.init({
            apiKey: this.config.apiKey,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          });
          this.gapiInited = true;
          resolve();
        });
      });

      // تهيئة Google Identity Services
      this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response: any) => {
          if (response.access_token) {
            this.accessToken = response.access_token;
          }
        },
      });
      this.gisInited = true;

      return true;
    } catch (error) {
      console.error('Error initializing Google Drive:', error);
      return false;
    }
  }

  /**
   * تحميل مكتبات Google APIs
   */
  private async loadGoogleAPIs(): Promise<void> {
    return new Promise((resolve, reject) => {
      // تحميل gapi
      if (!(window as any).gapi) {
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.onload = () => {
          // تحميل gis
          const gisScript = document.createElement('script');
          gisScript.src = 'https://accounts.google.com/gsi/client';
          gisScript.onload = () => resolve();
          gisScript.onerror = reject;
          document.body.appendChild(gisScript);
        };
        gapiScript.onerror = reject;
        document.body.appendChild(gapiScript);
      } else {
        resolve();
      }
    });
  }

  /**
   * طلب تسجيل الدخول للحصول على صلاحية الوصول
   */
  async requestAccess(): Promise<boolean> {
    if (!this.gisInited) {
      console.error('Google Identity Services not initialized');
      return false;
    }

    return new Promise((resolve) => {
      this.tokenClient.callback = (response: any) => {
        if (response.access_token) {
          this.accessToken = response.access_token;
          resolve(true);
        } else {
          resolve(false);
        }
      };
      this.tokenClient.requestAccessToken();
    });
  }

  /**
   * رفع ملف إلى Google Drive
   */
  async uploadFile(file: File, folder: string): Promise<string | null> {
    try {
      if (!this.accessToken) {
        const hasAccess = await this.requestAccess();
        if (!hasAccess) {
          console.error('No access token available');
          return null;
        }
      }

      // البحث عن مجلد أو إنشاؤه
      const folderId = await this.getOrCreateFolder(folder);
      if (!folderId) {
        console.error('Failed to get or create folder');
        return null;
      }

      // تحويل الملف إلى base64
      const base64Data = await this.fileToBase64(file);

      // بيانات الملف
      const metadata = {
        name: `${Date.now()}_${file.name}`,
        mimeType: file.type,
        parents: [folderId],
      };

      // رفع الملف
      const boundary = '-------314159265358979323846';
      const delimiter = '\r\n--' + boundary + '\r\n';
      const closeDelimiter = '\r\n--' + boundary + '--';

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + file.type + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        closeDelimiter;

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + this.accessToken,
            'Content-Type': 'multipart/related; boundary=' + boundary,
          },
          body: multipartRequestBody,
        }
      );

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      return result.id; // إرجاع معرف الملف
    } catch (error) {
      console.error('Error uploading file to Google Drive:', error);
      return null;
    }
  }

  /**
   * الحصول على مجلد أو إنشاؤه
   */
  private async getOrCreateFolder(folderName: string): Promise<string | null> {
    try {
      // البحث عن المجلد
      const response = await (window as any).gapi.client.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });

      if (response.result.files && response.result.files.length > 0) {
        return response.result.files[0].id;
      }

      // إنشاء المجلد إذا لم يكن موجوداً
      const createResponse = await (window as any).gapi.client.drive.files.create({
        resource: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: this.config.folderId ? [this.config.folderId] : undefined,
        },
        fields: 'id',
      });

      return createResponse.result.id;
    } catch (error) {
      console.error('Error getting or creating folder:', error);
      return null;
    }
  }

  /**
   * تحويل الملف إلى base64
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }

  /**
   * الحصول على رابط الملف
   */
  async getFileUrl(fileId: string): Promise<string> {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  /**
   * تحميل الملف
   */
  async downloadFile(fileId: string): Promise<Blob | null> {
    try {
      if (!this.accessToken) {
        const hasAccess = await this.requestAccess();
        if (!hasAccess) {
          console.error('No access token available');
          return null;
        }
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: 'Bearer ' + this.accessToken,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Download failed');
      }

      return await response.blob();
    } catch (error) {
      console.error('Error downloading file:', error);
      return null;
    }
  }

  /**
   * حذف الملف
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      if (!this.accessToken) {
        const hasAccess = await this.requestAccess();
        if (!hasAccess) {
          console.error('No access token available');
          return false;
        }
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer ' + this.accessToken,
          },
        }
      );

      return response.ok;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * التحقق من حالة الاتصال
   */
  isConnected(): boolean {
    return this.gapiInited && this.gisInited && !!this.accessToken;
  }
}

// إنشاء نسخة واحدة من Google Drive Storage
let googleDriveInstance: GoogleDriveStorage | null = null;

export const initializeGoogleDrive = (config: GoogleDriveConfig): GoogleDriveStorage => {
  if (!googleDriveInstance) {
    googleDriveInstance = new GoogleDriveStorage(config);
  }
  return googleDriveInstance;
};

export const getGoogleDriveInstance = (): GoogleDriveStorage | null => {
  return googleDriveInstance;
};

export default GoogleDriveStorage;
