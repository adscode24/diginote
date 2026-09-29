package com.diginote.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Parcelable;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Plugin Capacitor untuk menerima share gambar/teks dari aplikasi lain.
 *
 * Alur: MainActivity menyimpan Intent mentah -> JS memanggil getSharedData()
 * (saat start & resume) -> plugin menjalankan OCR ML Kit + parsing di
 * background thread -> mengembalikan JSON siap prefill form transaksi.
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {
    private static final String TAG = "ShareReceiver";
    private static volatile Intent pendingIntent = null;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public static void setPendingIntent(Intent intent) {
        if (isShareIntent(intent)) {
            pendingIntent = new Intent(intent);
            Log.i(TAG, "Share intent disimpan: " + intent.getAction() + " type=" + intent.getType());
        }
    }

    public static boolean hasPendingIntent() {
        return isShareIntent(pendingIntent);
    }

    private static boolean isShareIntent(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        String type = intent.getType();
        if (type == null) return intent.hasExtra(Intent.EXTRA_STREAM) || intent.hasExtra(Intent.EXTRA_TEXT);
        return type.startsWith("image/") || type.startsWith("text/");
    }

    @PluginMethod
    public void getSharedData(PluginCall call) {
        Intent intent = pendingIntent;
        if (intent == null) {
            try {
                intent = getActivity().getIntent();
            } catch (Exception ignored) {}
        }
        if (!isShareIntent(intent)) {
            JSObject ret = new JSObject();
            ret.put("hasData", false);
            call.resolve(ret);
            return;
        }
        final Intent shared = new Intent(intent);
        executor.execute(() -> {
            try {
                JSObject result = parseIntent(shared);
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception e) {
                Log.e(TAG, "parse share gagal", e);
                JSObject ret = new JSObject();
                ret.put("hasData", false);
                ret.put("error", String.valueOf(e.getMessage()));
                getActivity().runOnUiThread(() -> call.resolve(ret));
            }
        });
    }

    @PluginMethod
    public void clearSharedData(PluginCall call) {
        pendingIntent = null;
        try {
            Intent cur = getActivity().getIntent();
            if (isShareIntent(cur)) {
                cur.setAction(Intent.ACTION_MAIN);
                cur.removeExtra(Intent.EXTRA_STREAM);
                cur.removeExtra(Intent.EXTRA_TEXT);
                cur.removeExtra(Intent.EXTRA_SUBJECT);
                cur.setType(null);
            }
        } catch (Exception ignored) {}
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private JSObject parseIntent(Intent intent) {
        String action = intent.getAction();
        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);

        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Parcelable extra = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (extra instanceof Uri) uris.add((Uri) extra);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Parcelable> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) {
                for (Parcelable p : list) {
                    if (p instanceof Uri) uris.add((Uri) p);
                    if (uris.size() >= 3) break;
                }
            }
        }

        StringBuilder ocrText = new StringBuilder();
        String receiptImage = null;
        for (Uri uri : uris) {
            try {
                Bitmap bmp = loadDownscaledBitmap(uri, 1280);
                if (bmp == null) continue;
                if (receiptImage == null) {
                    receiptImage = bitmapToDataUrl(bmp, 640, 60);
                }
                String t = runOcr(bmp);
                if (t != null && !t.trim().isEmpty()) {
                    if (ocrText.length() > 0) ocrText.append("\n");
                    ocrText.append(t.trim());
                }
                if (!bmp.isRecycled()) bmp.recycle();
            } catch (Exception e) {
                Log.w(TAG, "gagal proses uri: " + uri, e);
            }
        }

        String rawText = ocrText.toString().trim();
        if (rawText.isEmpty() && sharedText != null) rawText = sharedText.trim();
        if (rawText.isEmpty() && subject != null) rawText = subject.trim();

        JSObject ret = new JSObject();
        if (rawText.isEmpty() && receiptImage == null) {
            ret.put("hasData", false);
            return ret;
        }
        ParsedTx parsed = parseTransactionText(rawText);
        ret.put("hasData", true);
        ret.put("amount", parsed.amount);
        ret.put("type", parsed.type);
        ret.put("categoryHint", parsed.categoryHint);
        ret.put("date", parsed.date);
        ret.put("description", parsed.description);
        ret.put("rawText", rawText.length() > 2000 ? rawText.substring(0, 2000) : rawText);
        if (receiptImage != null) ret.put("receiptImage", receiptImage);
        ret.put("mimeType", intent.getType() != null ? intent.getType() : "");
        return ret;
    }

    private Bitmap loadDownscaledBitmap(Uri uri, int maxDim) {
        try {
            InputStream in1 = getContext().getContentResolver().openInputStream(uri);
            if (in1 == null) return null;
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(in1, null, bounds);
            try { in1.close(); } catch (Exception ignored) {}
            int w = bounds.outWidth, h = bounds.outHeight;
            if (w <= 0 || h <= 0) {
                InputStream in2 = getContext().getContentResolver().openInputStream(uri);
                Bitmap bmp = BitmapFactory.decodeStream(in2);
                try { if (in2 != null) in2.close(); } catch (Exception ignored) {}
                return bmp;
            }
            int sample = 1;
            while ((w / sample) > maxDim || (h / sample) > maxDim) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            InputStream in3 = getContext().getContentResolver().openInputStream(uri);
            Bitmap bmp = BitmapFactory.decodeStream(in3, null, opts);
            try { if (in3 != null) in3.close(); } catch (Exception ignored) {}
            return bmp;
        } catch (Exception e) {
            Log.w(TAG, "load bitmap gagal", e);
            return null;
        }
    }

    private String bitmapToDataUrl(Bitmap src, int maxDim, int quality) {
        try {
            int w = src.getWidth(), h = src.getHeight();
            float scale = Math.min(1f, (float) maxDim / (float) Math.max(w, h));
            Bitmap bmp = src;
            if (scale < 1f) {
                int nw = Math.max(1, Math.round(w * scale));
                int nh = Math.max(1, Math.round(h * scale));
                bmp = Bitmap.createScaledBitmap(src, nw, nh, true);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, out);
            String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            return "data:image/jpeg;base64," + b64;
        } catch (Exception e) {
            Log.w(TAG, "compress gagal", e);
            return null;
        }
    }

    private String runOcr(Bitmap bitmap) {
        try {
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            Text result = Tasks.await(recognizer.process(image));
            return result.getText();
        } catch (Exception e) {
            Log.w(TAG, "OCR gagal", e);
            return null;
        }
    }

    private static class ParsedTx {
        long amount = 0;
        String type = "expense";
        String categoryHint = "";
        String date = "";
        String description = "";
    }

    private ParsedTx parseTransactionText(String text) {
        ParsedTx data = new ParsedTx();
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
        data.date = sdf.format(new Date());
        if (text == null || text.trim().isEmpty()) return data;
        String t = text;

        // --- Nominal: prioritaskan pola Rp/IDR, fallback angka terbesar >= 1000 ---
        long best = 0;
        Matcher mRp = Pattern.compile("(?i)(?:Rp\\.?|IDR)\\s*([\\d.,]+)").matcher(t);
        while (mRp.find()) {
            long v = digitsToLong(mRp.group(1));
            if (v > best) best = v;
        }
        if (best > 0) {
            data.amount = best;
        } else {
            Matcher mNum = Pattern.compile("(?<!\\d)(\\d[\\d.,]{3,})(?!\\d)").matcher(t);
            while (mNum.find()) {
                long v = digitsToLong(mNum.group(1));
                if (v > best) best = v;
            }
            if (best >= 1000) data.amount = best;
        }

        // --- Jenis transaksi ---
        String lower = t.toLowerCase(Locale.getDefault());
        boolean inKw = lower.contains("diterima") || lower.contains("masuk") || lower.contains("pemasukan")
                || lower.contains("credit") || lower.contains("top up") || lower.contains("topup")
                || lower.contains("gajian") || lower.contains("gaji") || lower.contains("refund")
                || lower.contains("cashback") || lower.contains("dana masuk");
        boolean outKw = lower.contains("bayar") || lower.contains("pembayaran") || lower.contains("keluar")
                || lower.contains("pengeluaran") || lower.contains("debit") || lower.contains("tagihan")
                || lower.contains("transfer keluar") || lower.contains("tarik tunai") || lower.contains("belanja");
        data.type = (inKw && !outKw) ? "income" : "expense";

        // --- Tanggal: dd/MM/yyyy, dd-MM-yyyy, dd MMM yyyy (Indonesia) ---
        Matcher mDate = Pattern.compile("(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})").matcher(t);
        if (mDate.find()) {
            try {
                int d = Integer.parseInt(mDate.group(1));
                int mo = Integer.parseInt(mDate.group(2));
                int y = Integer.parseInt(mDate.group(3));
                if (y < 100) y += 2000;
                Calendar cal = Calendar.getInstance();
                cal.set(y, mo - 1, d);
                data.date = sdf.format(cal.getTime());
            } catch (Exception ignored) {}
        } else {
            Matcher mDate2 = Pattern.compile("(\\d{1,2})\\s+(jan\\w*|feb\\w*|mar\\w*|apr\\w*|mei|jun\\w*|jul\\w*|agu\\w*|sep\\w*|okt\\w*|nov\\w*|des\\w*)\\s+(\\d{2,4})",
                    Pattern.CASE_INSENSITIVE).matcher(t);
            if (mDate2.find()) {
                try {
                    int d = Integer.parseInt(mDate2.group(1));
                    int mo = monthNameToNumber(mDate2.group(2).toLowerCase(Locale.getDefault()));
                    int y = Integer.parseInt(mDate2.group(3));
                    if (y < 100) y += 2000;
                    Calendar cal = Calendar.getInstance();
                    cal.set(y, mo - 1, d);
                    data.date = sdf.format(cal.getTime());
                } catch (Exception ignored) {}
            }
        }

        // --- Kategori ---
        if (containsAny(lower, "bensin", "pertamina", "shell", "spbu", "tol", "parkir", "ojek", "grab", "gojek", "bengkel", "servis")) {
            data.categoryHint = "Transport";
        } else if (containsAny(lower, "makan", "minum", "resto", "warung", "kopi", "kafe", "cafe", "kuliner", "food")) {
            data.categoryHint = "Makanan";
        } else if (containsAny(lower, "transfer", "biaya admin", "admin bank")) {
            data.categoryHint = "Transfer";
        } else if (containsAny(lower, "belanja", "shopping", "mall", "market", "indomaret", "alfamart", "shopee", "tokopedia")) {
            data.categoryHint = "Belanja";
        } else if (containsAny(lower, "listrik", "pln", "air", "pdam", "wifi", "indihome", "pulsa", "kuota", "internet", "telkom")) {
            data.categoryHint = "Tagihan";
        } else if (containsAny(lower, "sehat", "klinik", "apotek", "dokter", "rumah sakit", "obat")) {
            data.categoryHint = "Kesehatan";
        } else if (containsAny(lower, "gaji", "gajian", "honor", "bonus", "thr")) {
            data.categoryHint = "Gaji";
        }

        // --- Deskripsi: 200 karakter pertama yang dirapikan ---
        String clean = t.replaceAll("\\s+", " ").trim();
        data.description = clean.length() > 200 ? clean.substring(0, 200) : clean;
        return data;
    }

    private static long digitsToLong(String s) {
        if (s == null) return 0;
        String d = s.replaceAll("[^\\d]", "");
        if (d.isEmpty()) return 0;
        try {
            return Long.parseLong(d);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static boolean containsAny(String hay, String... needles) {
        for (String n : needles) if (hay.contains(n)) return true;
        return false;
    }

    private static int monthNameToNumber(String m) {
        if (m.startsWith("jan")) return 1;
        if (m.startsWith("feb")) return 2;
        if (m.startsWith("mar")) return 3;
        if (m.startsWith("apr")) return 4;
        if (m.startsWith("mei") || m.startsWith("may")) return 5;
        if (m.startsWith("jun")) return 6;
        if (m.startsWith("jul")) return 7;
        if (m.startsWith("agu") || m.startsWith("aug")) return 8;
        if (m.startsWith("sep")) return 9;
        if (m.startsWith("okt") || m.startsWith("oct")) return 10;
        if (m.startsWith("nov")) return 11;
        if (m.startsWith("des") || m.startsWith("dec")) return 12;
        return 1;
    }
}
