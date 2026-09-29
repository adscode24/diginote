const fs = require('fs');
const path = require('path');

// Menerapkan dukungan Share Target + OCR ke android/ hasil `npx cap add android`
// (direktori android/ di-gitignore, jadi patch ini dijalankan di CI setelah
// `npx cap sync android` dan sebelum build Gradle).
// Idempoten: aman dijalankan berulang kali maupun di clone lokal.
function main() {
  const root = path.resolve(__dirname, '..');
  const patchDir = path.join(root, 'android-patch');
  const javaDir = path.join(root, 'android/app/src/main/java/com/diginote/app');
  const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  const gradlePath = path.join(root, 'android/app/build.gradle');

  if (!fs.existsSync(path.join(root, 'android'))) {
    throw new Error('Direktori android/ tidak ditemukan (jalankan npx cap add android dulu)');
  }
  fs.mkdirSync(javaDir, { recursive: true });

  // 1. Salin file Java plugin + activity (overwrite penuh = deterministik)
  for (const f of ['ShareReceiverPlugin.java', 'MainActivity.java']) {
    const src = path.join(patchDir, f);
    if (!fs.existsSync(src)) throw new Error(`Template tidak ditemukan: ${src}`);
    fs.copyFileSync(src, path.join(javaDir, f));
    console.log(`java: ${f} OK`);
  }

  // 2. AndroidManifest: tambah intent-filter SEND/SEND_MULTIPLE (idempoten)
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android.intent.action.SEND')) {
    const mainIdx = manifest.indexOf('android.intent.action.MAIN');
    if (mainIdx === -1) throw new Error('Blok MAIN/LAUNCHER tidak ditemukan di AndroidManifest.xml');
    const closeIdx = manifest.indexOf('</intent-filter>', mainIdx);
    if (closeIdx === -1) throw new Error('Penutup intent-filter LAUNCHER tidak ditemukan');
    const insertAt = closeIdx + '</intent-filter>'.length;
    const filters = `
            <!-- Share Target DigiNote (disuntik scripts/android-share-patch.cjs) -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND_MULTIPLE" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>`;
    manifest = manifest.slice(0, insertAt) + filters + manifest.slice(insertAt);
    fs.writeFileSync(manifestPath, manifest);
    console.log('AndroidManifest.xml: intent-filter SEND/SEND_MULTIPLE OK');
  } else {
    console.log('AndroidManifest.xml: sudah ada filter SEND, dilewati');
  }

  // 3. build.gradle: tambah ML Kit Text Recognition (idempoten)
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  if (!gradle.includes('com.google.mlkit:text-recognition')) {
    const anchor = "implementation project(':capacitor-cordova-android-plugins')";
    if (!gradle.includes(anchor)) throw new Error('Anchor dependencies tidak ditemukan di android/app/build.gradle');
    gradle = gradle.replace(
      anchor,
      anchor + `\n    implementation "com.google.mlkit:text-recognition:16.0.0" // disuntik scripts/android-share-patch.cjs`
    );
    fs.writeFileSync(gradlePath, gradle);
    console.log('build.gradle: ML Kit text-recognition OK');
  } else {
    console.log('build.gradle: ML Kit sudah ada, dilewati');
  }

  console.log('Patch share DigiNote selesai.');
}

main();
