#!/bin/bash
# Сборка программы «Планер» для Mac из общего кода репозитория.
# Запуск: bash mac/build.sh  (нужны node и npm). Результат: mac/dist/Planer.app
set -e
cd "$(dirname "$0")"
rm -rf app dist && mkdir -p app/src app/vendor
cp main.js preload.js package.json index.html app/
cp ../config.js app/
cp ../src/*.js ../src/*.css app/src/ && rm -f app/src/web.js app/src/web.css
cp ../vendor/supabase.js ../vendor/591.supabase.js app/vendor/
cp icon.icns app/ 2>/dev/null || true
[ -d node_modules/@electron/packager ] || npm i --no-save @electron/packager@20.3.0 >/dev/null
VER=$(node -p "require('./package.json').version")
npx electron-packager app "Planer" --platform=darwin --arch=arm64 --electron-version=43.8.6 ${ELECTRON_ZIP_DIR:+--electron-zip-dir=$ELECTRON_ZIP_DIR} \
  --icon=icon.icns --app-bundle-id=ru.planer.app --app-category-type=public.app-category.productivity \
  --executable-name=Planer --app-version="$VER" --out=dist --overwrite --asar --ignore='^/icon\.icns$' 2>&1 | grep -v WARNING
python3 -c "import plistlib;p='dist/Planer-darwin-arm64/Planer.app/Contents/Info.plist';d=plistlib.load(open(p,'rb'));d['CFBundleDisplayName']='Планер';plistlib.dump(d,open(p,'wb'))"
echo "Готово: mac/dist/Planer-darwin-arm64/Planer.app"
