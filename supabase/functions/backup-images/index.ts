import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Image Backup to Google Drive
 *
 * يقوم بنسخ الصور من Supabase Storage إلى Google Drive
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BackupImagesRequest {
  bucket?: 'invoices' | 'receipts' | 'all';
  limit?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { bucket = 'all', limit = 100 } = await req.json() as BackupImagesRequest;

    // إنشاء سجل نسخ احتياطي
    const { data: logEntry, error: logError } = await supabase
      .from("backup_logs")
      .insert({
        backup_type: "images",
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) throw logError;

    // جلب إعدادات Google Drive
    const { data: settings, error: settingsError } = await supabase
      .from("backup_settings")
      .select("*")
      .single();

    if (settingsError || !settings?.google_drive_enabled) {
      await supabase
        .from("backup_logs")
        .update({
          status: "failed",
          error_message: "Google Drive not configured",
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Google Drive not enabled or configured"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // تحديد buckets للنسخ
    const bucketsToBackup = bucket === 'all' ? ['invoices', 'receipts'] : [bucket];

    let totalImages = 0;
    let successfulUploads = 0;
    let failedUploads = 0;
    const errors: string[] = [];

    for (const bucketName of bucketsToBackup) {
      try {
        // جلب قائمة الملفات
        const { data: files, error: listError } = await supabase
          .storage
          .from(bucketName)
          .list('', {
            limit,
            sortBy: { column: 'created_at', order: 'desc' },
          });

        if (listError) {
          errors.push(`${bucketName}: ${listError.message}`);
          continue;
        }

        if (!files || files.length === 0) {
          console.log(`No files in bucket: ${bucketName}`);
          continue;
        }

        console.log(`Found ${files.length} files in ${bucketName}`);

        // نسخ كل ملف
        for (const file of files) {
          try {
            totalImages++;

            // تحميل الملف من Storage
            const { data: fileData, error: downloadError } = await supabase
              .storage
              .from(bucketName)
              .download(file.name);

            if (downloadError || !fileData) {
              errors.push(`Download failed: ${bucketName}/${file.name}`);
              failedUploads++;
              continue;
            }

            // رفع إلى Google Drive
            const uploadResult = await uploadImageToGoogleDrive(
              fileData,
              `${bucketName}_${file.name}`,
              settings.google_drive_folder_id,
              settings.google_drive_credentials,
              bucketName
            );

            if (uploadResult.success) {
              successfulUploads++;
              console.log(`✓ Uploaded: ${file.name}`);
            } else {
              failedUploads++;
              errors.push(`Upload failed: ${bucketName}/${file.name}`);
            }
          } catch (fileError) {
            failedUploads++;
            errors.push(`${bucketName}/${file.name}: ${fileError.message}`);
          }
        }
      } catch (bucketError) {
        errors.push(`Bucket ${bucketName}: ${bucketError.message}`);
      }
    }

    // تحديث سجل النسخ الاحتياطي
    const status = failedUploads === 0 ? "success" : (successfulUploads > 0 ? "success" : "failed");

    await supabase
      .from("backup_logs")
      .update({
        status,
        records_count: successfulUploads,
        error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        completed_at: new Date().toISOString(),
        metadata: {
          total_images: totalImages,
          successful_uploads: successfulUploads,
          failed_uploads: failedUploads,
          buckets: bucketsToBackup,
        },
      })
      .eq("id", logEntry.id);

    return new Response(
      JSON.stringify({
        success: status === "success",
        backup_id: logEntry.id,
        total_images: totalImages,
        successful_uploads: successfulUploads,
        failed_uploads: failedUploads,
        errors: errors.length > 0 ? errors.slice(0, 10) : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Image backup error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// رفع صورة إلى Google Drive
async function uploadImageToGoogleDrive(
  imageBlob: Blob,
  fileName: string,
  folderId: string,
  credentials: string,
  subfolder: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const creds = JSON.parse(credentials);
    const accessToken = await getAccessToken(creds);

    // إنشاء مجلد فرعي للنوع (invoices/receipts) إذا لم يكن موجوداً
    const subFolderId = await getOrCreateSubfolder(
      accessToken,
      folderId,
      `Images_${subfolder}`
    );

    // تحديد نوع الملف
    const mimeType = fileName.endsWith('.pdf') ? 'application/pdf' :
                     fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' :
                     fileName.endsWith('.png') ? 'image/png' :
                     'application/octet-stream';

    const metadata = {
      name: fileName,
      parents: [subFolderId],
      mimeType,
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", imageBlob);

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = await response.json();
    return { success: true, id: result.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// إنشاء أو جلب مجلد فرعي
async function getOrCreateSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string
): Promise<string> {
  // البحث عن المجلد
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // إنشاء المجلد إذا لم يكن موجوداً
  const createResponse = await fetch(
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      }),
    }
  );

  if (!createResponse.ok) {
    throw new Error("Failed to create subfolder");
  }

  const createData = await createResponse.json();
  return createData.id;
}

// الحصول على access token
async function getAccessToken(credentials: any): Promise<string> {
  if (credentials.access_token) {
    return credentials.access_token;
  }

  if (credentials.refresh_token) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Google Drive access token");
    }

    const data = await response.json();
    return data.access_token;
  }

  throw new Error("No valid Google Drive credentials");
}
