import { supabase } from './supabase';

const BUCKET_NAME = 'receipts';

export const uploadFile = async (file: File, folder: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file, {
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
