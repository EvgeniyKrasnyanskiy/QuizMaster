const fs = require('fs');
const path = require('path');

// Пути к файлам
const packagePath = path.join(__dirname, '../package.json');
const appJsonPath = path.join(__dirname, '../app.json');

// Читаем package.json
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const newVersion = pkg.version;

// Читаем app.json
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

// Обновляем версию в app.json
if (appJson.expo.version !== newVersion) {
  appJson.expo.version = newVersion;
  
  // Опционально: инкрементируем versionCode для Android (только число)
  if (appJson.expo.android && appJson.expo.android.versionCode) {
    appJson.expo.android.versionCode += 1;
  }

  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
  console.log(`✅ [Sync] app.json version updated to ${newVersion}`);
  if (appJson.expo.android?.versionCode) {
    console.log(`✅ [Sync] Android versionCode bumped to ${appJson.expo.android.versionCode}`);
  }
} else {
  console.log('ℹ️ [Sync] Versions are already in sync.');
}
