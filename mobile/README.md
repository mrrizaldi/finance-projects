# Finance Mobile (Android)

App Android Kotlin + Compose. Bicara langsung ke Supabase (auth + postgrest), tabel/RPC sama dengan dashboard.

## Setup sekali (tanpa Android Studio)

1. JDK 21: `/usr/lib/jvm/java-21-openjdk-amd64` (`java -version` → 21).
2. Android SDK:
   ```bash
   mkdir -p ~/Android/Sdk/cmdline-tools && cd ~/Android/Sdk/cmdline-tools
   curl -LO https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip
   unzip -q commandlinetools-linux-15859902_latest.zip && rm commandlinetools-linux-15859902_latest.zip
   mv cmdline-tools latest
   ```
3. Env di `~/.zshrc`:
   ```bash
   export ANDROID_HOME="$HOME/Android/Sdk"
   export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
   ```
4. Paket SDK:
   ```bash
   yes | sdkmanager --licenses
   sdkmanager "platform-tools" "platforms;android-37.0" "build-tools;36.0.0"
   ```
5. `mobile/local.properties` (gitignored):
   ```
   sdk.dir=/home/<user>/Android/Sdk
   SUPABASE_URL=https://dqvdhkpqyynvwfbuqyzu.supabase.co
   SUPABASE_ANON_KEY=<anon key, sama dengan VITE_SUPABASE_ANON_KEY dashboard>
   ```

## Build, test, install

```bash
cd mobile
./gradlew test                 # unit JVM
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
adb devices                    # HP harus muncul (USB debugging aktif)
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n id.aigra.finance/.MainActivity
adb exec-out screencap -p > /path/screenshot.png
adb logcat -d | grep -iE "FATAL|AndroidRuntime"   # harus kosong
```

## Struktur

`app/src/main/java/id/aigra/finance/` — `data/remote` (SupabaseApi + DTO), `data/local` (Room), `data/Repository.kt`, `ui/<layar>` (ViewModel + Screen), `ui/theme` (palette B), `util` (Rupiah, tanggal Jakarta). DI manual di `AppContainer.kt`.

## Catatan

- Saldo TIDAK pernah dihitung di app; hanya RPC `record_manual_entry`/`record_manual_transfer` yang mengubah `accounts.balance` (lihat `docs/RECONCILE.md`).
- Tanggal ke server: `yyyy-MM-dd` (DATE) dan `yyyy-MM-ddTHH:mm:ss+07:00` (timestamptz), zona Asia/Jakarta.
