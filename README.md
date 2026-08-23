# FB Movie Bot - Setup Guide (Hinglish)

Ye bot roz 3 baar (10 AM, 3 PM, 8 PM IST) tumhare Facebook Page pe trending/upcoming Bollywood, Hollywood aur South Indian movies ke posts (poster + AI caption + hashtags) automatically daalega. Setup ek baar karna hai, uske baad forever automatic chalega.

---

## STEP 1: TMDB API Key lena (2 min, free)

1. https://www.themoviedb.org/signup pe jaake free account banao
2. Login karke: https://www.themoviedb.org/settings/api pe jao
3. "Request an API Key" click karo -> "Developer" choose karo -> form fill karo (koi bhi reason likh do, jaise "personal project")
4. Tumhe ek **API Key (v3 auth)** milegi - ise copy karke kahin safe save kar lo

---

## STEP 2: Google Gemini API Key lena (free, koi card nahi chahiye)

1. https://aistudio.google.com pe jaake apne Google account se login karo
2. Top ya left mein "Get API key" button dhundo, click karo
3. "Create API key" click karo -> "Create API key in new project" choose karo
4. Key generate ho jayegi ("AIzaSy..." se start hogi) - copy karke save kar lo
5. Free tier mein roz kaafi requests milte hain (tumhare 3-4 daily calls ke liye kabhi khatam nahi hoga), koi card/billing add karne ki zaroorat nahi

---

## STEP 3: Facebook Page Access Token lena (thoda lamba hai, dhyan se karo)

1. https://developers.facebook.com pe jaake login karo (apne normal FB account se)
2. Top right "My Apps" -> "Create App" click karo
3. App type mein **"Business"** choose karo -> Next
4. App ka naam do (jaise `Movie Update Bot`) -> "Create App" click karo
5. Dashboard pe "Add Product" section mein **"Facebook Login"** aur uske through **"Graph API Explorer"** tak pahunchna hai - simplest tarika:
   - Seedha ye link kholo: https://developers.facebook.com/tools/explorer/
   - Top right dropdown mein apni newly-created app select karo
   - Dusre dropdown mein "User or Page" -> apna **Page** select karo (jo naam tumne page ka rakha hai)
   - "Permissions" mein ye add karo: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
   - "Generate Access Token" click karo, Facebook login popup aayega -> allow karo
6. Ab tumhare paas ek **short-lived token** hai (1 ghante mein expire ho jata hai) - hume **long-lived (60 din) Page token** chahiye:
   - https://developers.facebook.com/tools/debug/accesstoken/ pe jao
   - Wahi token paste karo jo Graph API Explorer se mila -> "Debug"
   - Neeche "Extend Access Token" button milega (agar dikhe) - click karo, ya niche wala manual tarika use karo:
   
   Terminal mein ye command chalao (apna values daal ke):
   ```
   curl -i -X GET "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_LIVED_TOKEN"
   ```
   - `YOUR_APP_ID` aur `YOUR_APP_SECRET` tumhe App Dashboard -> Settings -> Basic mein milenge
   - Response mein jo naya `access_token` milega, wahi tumhara **60-din wala long-lived token** hai
7. Ye long-lived token save kar lo (isse baad mein GitHub Secrets mein daalna hai)

   **Note:** Ye token 60 din baad expire hoga, tab tumhe ye Step 3 dobara karna padega (2 min ka kaam). Chaho to main baad mein isko permanent System User token mein convert karne ka tarika bhi bata sakta hoon jo expire hi nahi hota.

8. **Facebook Page ID** nikalne ke liye: apne Page pe jao -> "About" section -> neeche scroll karo -> "Page ID" likha milega. Ya phir: https://www.facebook.com/YourPageName/about pe jao.

---

## STEP 4: Code ko GitHub pe daalna

Terminal (VS Code ya kahin bhi) khol ke ye commands chalao, jahan ye `fb-movie-bot` folder hai:

```bash
cd fb-movie-bot
git init
git add .
git commit -m "Initial commit - FB movie bot"
```

Ab GitHub pe naya repo banao:
1. https://github.com/new pe jao
2. Repo name do (jaise `fb-movie-bot`) -> **Private** select karo (important, kyunki secrets involve hain) -> "Create repository"
3. GitHub jo commands dikhayega unme se ye wale chalao (apna username/repo-name daal ke):

```bash
git remote add origin https://github.com/YOUR_USERNAME/fb-movie-bot.git
git branch -M main
git push -u origin main
```

---

## STEP 5: GitHub Secrets add karna (ye sabse important step hai)

1. Apne GitHub repo pe jao -> **Settings** tab -> left sidebar mein **Secrets and variables** -> **Actions**
2. "New repository secret" click karo, aur ye 4 secrets ek-ek karke add karo:

   | Name | Value |
   |------|-------|
   | `TMDB_API_KEY` | Step 1 wali key |
   | `GEMINI_API_KEY` | Step 2 wali key |
   | `FB_PAGE_ID` | Step 3 wala Page ID |
   | `FB_PAGE_ACCESS_TOKEN` | Step 3 wala long-lived token |

Har secret ke liye: naam daalo, value paste karo, "Add secret" click karo.

---

## STEP 6: Test karna ki sab connect ho raha hai

Repo pe jaake **Actions** tab kholo. Wahan "Auto Post Movie Updates" workflow dikhega.
- Right side "Run workflow" button se manually ek baar trigger kar sakte ho (schedule ka wait kiye bina)
- Click karne ke baad thodi der mein green tick ✅ aana chahiye - iska matlab post ho gaya
- Agar red cross ❌ aaye, to us run pe click karke logs padho - usme exact error dikhega (galat token, galat key, etc.)

Uske baad apna Facebook Page check karo - naya post dikhna chahiye poster image + caption + hashtags ke saath.

---

---

## BONUS: Reels bhi automatic chahiye? (optional, image-posts ko impact nahi karta)

Ye ek **completely separate system** hai - alag script (`reel-bot.js`), alag workflow (`reel-bot.yml`), alag history file (`state/posted-reels.json`). Isse upar wale image-post bot pe koi asar nahi padta, dono independently chalte hain.

Reel kaise banta hai: movie poster pe slow zoom effect (Ken Burns style) + movie title/release date text overlay + background music - fully FFmpeg se render hota hai, phir Facebook Reels API se seedha upload. Koi movie footage/trailer use nahi hota, isliye copyright-safe hai.

**Extra setup jo sirf reels ke liye chahiye:**

1. `assets/audio/` folder mein 3-5 royalty-free music files (.mp3) daal do - `assets/audio/README.md` mein free sources diye hain (YouTube Audio Library, Facebook Sound Collection, Pixabay Music). Bot inme se random pick karega har reel ke liye.
2. Facebook token mein ek extra permission chahiye: `publish_video` - Step 3 mein jab permissions add kar rahe the, ye bhi add kar dena (`pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `publish_video`)
3. Baaki sab automatic hai - `reel-bot.yml` workflow roz 6 PM IST pe khud trigger hoga (GitHub Secrets same wale use honge jo pehle se add kiye hain, kuch naya add nahi karna)
4. Test karne ke liye: Actions tab mein "Auto Post Movie Reels" workflow -> "Run workflow" (manual trigger)

Frequency change karni ho (abhi 1x/day hai) to `reel-bot.yml` mein cron line adjust ho sakti hai - bata dena.

---

## Bas, ho gaya!

Isके baad bot roz khud-ba-khud 3 baar post karega - 10 AM, 3 PM, 8 PM IST. Tumhe kuch nahi karna, bas:
- Har 60 din mein Step 3 wala Facebook token refresh karna hoga (Facebook ka rule hai, permanent free token possible nahi)
- Occasionally Actions tab check kar lena ki sab green hai

Agar kabhi post frequency, movie industries, ya caption ka style change karna ho, bata dena - code mein easily adjust ho jayega.
