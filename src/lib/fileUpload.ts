import { supabase } from './supabase';

const BUCKET_NAME = 'receipts';
const MAX_WIDTH = 1024;
const MAX_FILE_SIZE = 200 * 1024; // 200KB

/**
 * ضغط الصورة قبل الرفع
 * يقلل حجم الصورة إلى أقل من 200KB مع الحفاظ على الجودة المعقولة
 */
const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    // إذا كان الملف ليس صورة، نعيده كما هو
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // تغيير حجم الصورة إذا كانت أكبر من MAX_WIDTH
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // محاولة ضغط الصورة بجودات مختلفة حتى نصل لحجم أقل من 200KB
        const tryCompress = (quality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              // إذا كان الحجم أقل من 200KB أو الجودة أقل من 0.3، نقبل النتيجة
              if (blob.size <= MAX_FILE_SIZE || quality <= 0.3) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                // نحاول مرة أخرى بجودة أقل
                tryCompress(quality - 0.1);
              }
            },
            'image/jpeg',
            quality
          );
        };

        // نبدأ بجودة 0.8
        tryCompress(0.8);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

export const ensureBucketExists = async (): Promise<boolean> => {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      console.error('Error checking buckets:', error);
      return false;
    }

    const bucketExists = buckets.some(bucket => bucket.id === BUCKET_NAME);

    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760,
        allowedMimeTypes: [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('Error ensuring bucket exists:', err);
    return false;
  }
};

export const uploadFile = async (file: File, folder: string): Promise<string | null> => {
  try {
    const bucketReady = await ensureBucketExists();

    if (!bucketReady) {
      console.error('Storage bucket is not available');
      return null;
    }

    // ضغط الصورة قبل الرفع
    let fileToUpload = file;
    if (file.type.startsWith('image/')) {
      try {
        fileToUpload = await compressImage(file);
        console.log(`Image compressed: ${(file.size / 1024).toFixed(2)}KB -> ${(fileToUpload.size / 1024).toFixed(2)}KB`);
      } catch (error) {
        console.error('Error compressing image, uploading original:', error);
      }
    }

    const fileExt = fileToUpload.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileToUpload, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading file:', error);
      return null;
    }

    return data.path;
  } catch (err) {
    console.error('Error uploading file:', err);
    return null;
  }
};

export const getFileUrl = (filePath: string): string => {
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return data.publicUrl;
};

export const downloadFile = async (filePath: string): Promise<Blob | null> => {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(filePath);

    if (error) {
      console.error('Error downloading file:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error downloading file:', err);
    return null;
  }
};

export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);

    if (error) {
      console.error('Error deleting file:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting file:', err);
    return false;
  }
};

export const getSignedUrl = async (filePath: string, expiresIn = 3600): Promise<string | null> => {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error creating signed URL:', err);
    return null;
  }
};
