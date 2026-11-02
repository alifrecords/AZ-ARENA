# AZIMXODJAYEV MUSIC ARENA

Teatr va konsertlar uchun sahna ovozini boshqarish dasturi. Tuzilishi **AZ-Playlist** bilan bir xil: kod GitHub'da turadi, Cloudflare Pages uni sayt qilib chiqaradi, adminga GitHub tokeni bilan kiriladi.

| Fayl / papka | Vazifasi |
| --- | --- |
| `index.html` | Sahna dasturi: ishoralar, BOSHLA, so'nish, takror, pult, metrlar, 20 daqiqalik sinov, PRO |
| `admin.html` | Faqat siz uchun: to'lovlar, karta, tariflar, kodlar, Telegram bot |
| `functions/api/` | Server qismi (Cloudflare Pages Functions): sinov, kodlar, to'lovlar, bot |
| `assets/` | Dastur va admin sahifa fayllari |
| `.github/workflows/remind.yml` | Har soatda PRO muddati tugayotganlarga eslatma |

Xarajat: **0 so'm**. GitHub, Cloudflare Pages, D1 va Telegram bepul.

---

## 1. GitHub'da repozitoriy ochish

1. github.com ga `alifrecords` hisobi bilan kiring.
2. **New repository** → nomi: `AZ-Arena` → **Public** yoki **Private** → **Create repository**.
3. **uploading an existing file** → shu papkadagi **barcha fayl va papkalarni** sudrab tashlang → **Commit changes**.
   `.github` papkasi ko'rinmasa: Windows'da "Yashirin elementlar"ni yoqing, Mac'da `Cmd + Shift + .` bosing.

## 2. Cloudflare Pages'ga ulash

1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → `AZ-Arena`.
2. Framework preset: **None** · Build command: **bo'sh** · Build output directory: **/** → **Save and Deploy**.
3. Sayt manzili: `https://az-arena.pages.dev`. Nom band bo'lsa, Cloudflare boshqa nom beradi.

## 3. D1 bazasini ulash (bir marta)

1. Cloudflare → shu loyiha → **Settings** → **Bindings** → **Add** → **D1 database**.
2. **Variable name:** `DB` (katta harflarda).
3. **D1 database:** AZ-Playlist'dagi mavjud bazani tanlang. ARENA jadvallari `ar_` bilan boshlanadi, playlistga tegmaydi. Xohlasangiz yangi baza ham yaratishingiz mumkin.
4. **Save** → **Deployments** → oxirgi deploy → **Retry deployment**. Bog'lash shundan keyin kuchga kiradi.

Jadvallarni yaratish shart emas: birinchi so'rovda o'zi yaratiladi.

## 4. Admin tokeni (AZ-Playlist'dagi token bilan bir xil)

Mavjud tokeningizga ruxsat qo'shing:

1. github.com/settings/personal-access-tokens → `az-admin` tokeni → **Edit**.
2. **Repository access** → *Only select repositories* → `AZ-Playlist` bilan birga **`AZ-Arena`** ni ham belgilang.
3. **Contents:** *Read and write* → **Update**.

Shunda bitta token bilan ikkala admin sahifaga kirasiz. Repo nomi boshqacha bo'lsa: Cloudflare → Settings → Variables → `ADMIN_REPO` = `alifrecords/YANGI-NOM`.

## 5. Admin sahifaga kirish

1. `https://az-arena.pages.dev/admin` ni oching.
2. GitHub hisob: `alifrecords` · Repozitoriy: `AZ-Arena` · Token → **Ulanish**.
3. **To'lov kartasi:** karta raqami va ismingiz → **Kartani saqlash**.
4. **Telegram bot:**
   1. @BotFather → `/newbot` → tokenni kiriting → **Botni ulash**. Webhook o'zi o'rnatiladi.
   2. **Bog'lash** → chiqqan havolani telefonda oching → **START**. To'lov cheklari endi shu chatga keladi.
5. **Tariflar va sinov:** narxlar va sinov muddati (standart 20 daqiqa) → **Saqlash**.

Admin sahifani telefonga ilova qilib o'rnatsa ham bo'ladi (brauzer menyusi → "Bosh ekranga qo'shish").

## 6. Avtomatik jarayon

| Qadam | Kim | Nima bo'ladi |
| --- | --- | --- |
| 1 | Xaridor | Sinov tugaydi → **Telegram bot orqali to'lash** (ID avtomatik o'tadi) |
| 2 | Bot | Tarif → karta raqami, summa, izoh uchun ID |
| 3 | Xaridor | Pul o'tkazadi, chek rasmini botga yuboradi |
| 4 | Bot → Siz | Chek **Tasdiqlash / Rad etish** tugmalari bilan keladi |
| 5 | Siz | Kartangizga pul tushganini tekshirib, **Tasdiqlash** ni bosasiz (botda yoki admin sahifada) |
| 6 | Bot | Tarifga mos kodni yaratib, xaridorga yuboradi |
| 7 | Xaridor | Kodni dasturga kiritadi → PRO |

**Botdagi admin buyruqlari:** `/kutilayotgan` · `/kod 1M` · `/karta 8600123412341234 Ism Familiya`

## 7. Litsenziya

- **Sinov** vaqti serverda hisoblanadi: dastur ochiq turgan vaqt sanaladi. Brauzer tozalansa ham shu kompyuter uchun hisob saqlanadi.
- **Kod** bitta kompyuterga bog'lanadi. Muddat faollashtirilgan kundan boshlab hisoblanadi.
- **PRO oflayn ishlaydi.** Litsenziya imzolangan (Ed25519) va kompyuterning o'zida tekshiriladi: sahnada internet uzilsa ham dastur to'xtamaydi.
- **Imzo kaliti D1 bazasida** (`ar_kv` jadvali, `ed_private`). Bazani o'chirmang, aks holda berilgan barcha kodlar ishlamay qoladi.

## Muammo bo'lsa

| Belgi | Sabab va yechim |
| --- | --- |
| "Token noto'g'ri yoki … yozish huquqi yo'q" | Tokenga `AZ-Arena` uchun **Contents: Read and write** bering (4-bo'lim). |
| "D1 bazasi ulanmagan" | 3-bo'lim: nomi aynan `DB` bo'lsin, keyin **Retry deployment**. |
| Bot javob bermaydi | Admin → Telegram bot → **Botni ulash** ni qayta bosing (webhook yangilanadi). |
| Chek admin chatga kelmaydi | **Bog'lash** ni qayta bajaring va **Sinov xabari** bilan tekshiring. |
| O'zgarish saytda yo'q | Cloudflare 1–2 daqiqada yangilaydi: **Deployments** da holatni ko'ring. |

© AZIMXODJAYEV. Barcha huquqlar himoyalangan.
