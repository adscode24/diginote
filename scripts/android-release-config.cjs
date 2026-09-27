const fs = require('fs');
const path = require('path');

// Menyuntikkan konfigurasi signing rilis + version stamping ke
// android/app/build.gradle hasil `npx cap add android`.
// Env yang dibutuhkan: KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD,
// BUILD_VERSION_CODE, BUILD_VERSION_NAME.
function main() {
  const gradlePath = path.resolve(__dirname, '../android/app/build.gradle');
  if (!fs.existsSync(gradlePath)) {
    throw new Error(`Tidak ditemukan: ${gradlePath} (jalankan 'npx cap add android' dulu)`);
  }
  const versionCode = process.env.BUILD_VERSION_CODE;
  const versionName = process.env.BUILD_VERSION_NAME;
  if (!versionCode || !versionName) {
    throw new Error('BUILD_VERSION_CODE / BUILD_VERSION_NAME belum diisi');
  }
  for (const v of ['KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']) {
    if (!process.env[v]) throw new Error(`${v} belum diisi`);
  }

  let gradle = fs.readFileSync(gradlePath, 'utf8');

  // 1. Version stamping
  if (!/versionCode\s+\d+/.test(gradle)) throw new Error('Pola versionCode tidak ditemukan di build.gradle');
  if (!/versionName\s+"[^"]*"/.test(gradle)) throw new Error('Pola versionName tidak ditemukan di build.gradle');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);

  // 2. Signing config (idempoten: lewati bila sudah ada)
  if (!gradle.includes('diginote-release-signing')) {
    const signingBlock = `    signingConfigs {
        release {
            // Disuntik otomatis oleh scripts/android-release-config.cjs (tag: diginote-release-signing)
            storeFile file('upload-keystore.jks')
            storePassword System.getenv('KEYSTORE_PASSWORD')
            keyAlias System.getenv('KEY_ALIAS')
            keyPassword System.getenv('KEY_PASSWORD')
        }
    }
`;
    if (!/buildTypes\s*\{/.test(gradle)) throw new Error('Blok buildTypes tidak ditemukan di build.gradle');
    gradle = gradle.replace(/buildTypes\s*\{/, signingBlock + '    buildTypes {');

    // 3. Pakai signingConfig rilis pada buildType release
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{)/,
      '$1\n            signingConfig signingConfigs.release'
    );
    if (!gradle.includes('signingConfig signingConfigs.release')) {
      throw new Error('Gagal menyisipkan signingConfig ke buildType release');
    }
  }

  fs.writeFileSync(gradlePath, gradle);
  console.log(`android/app/build.gradle: versionCode=${versionCode} versionName=${versionName} + signing rilis OK`);
}

main();
