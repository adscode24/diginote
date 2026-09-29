package com.diginote.app;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * Single-activity Capacitor host.
 * Menerima ACTION_SEND / SEND_MULTIPLE (gambar & teks) dari aplikasi lain
 * dan meneruskannya ke ShareReceiverPlugin untuk dibaca dari WebView.
 *
 * PENTING: registerPlugin() HARUS dipanggil SEBELUM super.onCreate(),
 * karena bridge Capacitor dibuat di dalam super.onCreate() (BridgeActivity.load()).
 * Memanggilnya setelah super = plugin tidak pernah terdaftar = JS tidak bisa
 * membaca data share (form transaksi tidak terbuka).
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "DigiNoteMain";
    private static final String SHARE_EVENT = "diginote-share";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareReceiverPlugin.class);
        super.onCreate(savedInstanceState);
        ShareReceiverPlugin.setPendingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ShareReceiverPlugin.setPendingIntent(intent);
        fireShareEventIfPending();
    }

    @Override
    public void onResume() {
        super.onResume();
        fireShareEventIfPending();
    }

    /**
     * Bangunkan WebView segera bila ada share menunggu, agar form transaksi
     * terbuka tanpa menunggu polling. JS mendengarkan event window ini
     * sekaligus tetap polling saat start/resume sebagai cadangan.
     */
    private void fireShareEventIfPending() {
        try {
            if (!ShareReceiverPlugin.hasPendingIntent()) return;
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().post(() -> {
                try {
                    getBridge().triggerWindowJSEvent(SHARE_EVENT);
                } catch (Exception e) {
                    Log.w(TAG, "triggerWindowJSEvent gagal: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "fireShareEvent gagal: " + e.getMessage());
        }
    }
}
