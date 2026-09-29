package com.diginote.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * Single-activity Capacitor host.
 * Menerima ACTION_SEND / SEND_MULTIPLE (gambar & teks) dari aplikasi lain
 * dan meneruskannya ke ShareReceiverPlugin untuk dibaca dari WebView.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "DigiNoteMain";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            registerPlugin(ShareReceiverPlugin.class);
        } catch (Exception e) {
            Log.w(TAG, "registerPlugin gagal: " + e.getMessage());
        }
        ShareReceiverPlugin.setPendingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ShareReceiverPlugin.setPendingIntent(intent);
    }
}
