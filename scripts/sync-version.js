const fs = require('fs');
const path = require('path');

// Пути к файлам
const packagePath = path.join(__dirname, '../package.json');
const appJsonPath = path.join(__dirname, '../app.json');
const localPropsPath = path.join(__dirname, '../android/local.properties');

// Читаем файлы
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const newVersion = pkg.version;

let changed = false;

// 1. Синхронизация версии
if (appJson.expo.version !== newVersion) {
  appJson.expo.version = newVersion;
  changed = true;
}

// 2. Инкремент versionCode (строго Integer для Gradle)
if (appJson.expo.android) {
  const currentCode = parseInt(appJson.expo.android.versionCode || 0, 10);
  appJson.expo.android.versionCode = currentCode + 1;
  changed = true;
}

if (changed) {
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ [Sync] Версия обновлена до: ${newVersion}`);
  console.log(`✅ [Sync] Android versionCode: ${appJson.expo.android.versionCode}`);
  console.log('='.repeat(50));
  
  // 3. Напоминание о Prebuild (Критично для локальной сборки)
  console.log('\n⚠️  ВНИМАНИЕ (Local Prebuild Architecture):');
  console.log('Для применения изменений в нативном коде выполните:');
  console.log('\x1b[36m%s\x1b[0m', 'npx expo prebuild --platform android');
  
  console.log('\nЗатем можно запускать сборку:');
  console.log('\x1b[32m%s\x1b[0m', 'cd android && ./gradlew assembleRelease');
  console.log('='.repeat(50) + '\n');
} else {
  console.log('ℹ️ [Sync] Версии уже синхронизированы.');
}

// 4. Проверка безопасности local.properties
if (!fs.existsSync(localPropsPath)) {
  console.log('\x1b[31m%s\x1b[0m', '❌ КРИТИЧЕСКАЯ ОШИБКА: Файл android/local.properties не найден!');
  console.log('Без него Gradle не сможет найти Android SDK. Убедитесь, что он на месте.\n');
}
