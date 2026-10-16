# Walkie-Talkie Tactical Web PTT (ווקי-טוקי טקטי)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-brightgreen?style=for-the-badge&logo=googlechrome&logoColor=white)](https://dor2500.github.io/walkie-talkie/)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white)

🌐 **התנסות אונליין מיידית בדפדפן / בסמארטפון:**  
👉 **[https://dor2500.github.io/walkie-talkie/](https://dor2500.github.io/walkie-talkie/)**

מערכת מכשיר קשר (ווקי-טוקי) טקטית מודרנית מבוססת דפדפן, הפועלת בזמן אמת בחיבור P2P ישיר ומוצפן (WebRTC PeerJS Mesh), ללא צורך בהתקנת אפליקציה וללא תלות בשרתי הקלטה או מאגרים מרכזיים.

---

## ✨ תכונות עיקריות (Key Features)

- 📻 **ממשק טקטי עתידני (Tactical Skeuomorphic Radio Console):**
  - תצוגת LCD מוארת בסגנון צבאי/סייברפאנק עם חיווי תדר, מד אותות קליטה (RSSI) ומצב ערוץ.
  - כפתור שידור PTT תלת-ממדי בעיצוב גומי טקטי וטבעות קרינה מונפשות בעת שידור.
  - תמיכה מלאה בעברית (RTL) ובכל סוגי המסכים (Mobile First, Android, iOS, Desktop).

- 🔊 **מנוע סאונד מובנה (Zero-Asset Web Audio API Synthesizer):**
  - **צפצוף תחילת שידור (Chirp):** צמד טונים טקטיים בעת לחיצה על המיקרופון.
  - **רוג'ר ביפ ורעש סטטי (Roger Beep & Squelch):** שחרור הכפתור משמיע צליל סיום שידור ורעש סטטי אותנטי.
  - **רטט טקטי (Haptic Feedback):** משוב רטט אמיתי במכשירים ניידים בעת שידור ושחרור.
  - אפשרות השתקת אפקטי קול בלחיצת כפתור אחת.

- 📊 **מד תדרים וגלי קול חיים (Real-Time Audio Visualizer):**
  - קנבס מונפש ב-60 FPS המציג בזמן אמת את עוצמת וגלי הדיבור של המשדר.

- ⚙️ **מצבי שידור גמישים:**
  - **Push-To-Talk (החזק לדבר):** לחיצה והחזקה (Touch/Mouse/מקש `Space` במקלדת).
  - **נעילת שידור (Hands-Free):** לחיצה אחת להפעלה ולחיצה נוספת להפסקה – אידיאלי בזמן הליכה או נהיגה.

- 📶 **רשת קשר מבוזרת (WebRTC P2P Full Mesh):**
  - הפצת רשת אוטומטית בין כל חברי הערוץ.
  - תמיכה בשרתי STUN של Google למעבר חומות אש ונתבים ביתיים/סלולריים.
  - רשימת משתתפים חיה בערוץ עם חיווי זיהוי מי מדבר ברגע נתון.

- 📷 **סריקה ושיתוף מיידי:**
  - מחולל ברקוד QR פנימי לחיבור מהיר מהסמארטפון.
  - סורק ברקוד מובנה עם גישה ישירה למצלמת המכשיר.
  - שיתוף בלחיצה אחת ישירות ל-WhatsApp או העתקת קישור מהיר ללוח.

---

## 🚀 הוראות הפעלה מהירות

1. פתח את הקובץ `index.html` בכל דפדפן מודרני (Chrome, Edge, Safari, Firefox).
2. רשום את הכינוי שלך בקשר (למשל: "נשר 1" או "סבא").
3. בחר אם **לפתוח ערוץ חדש (מארח)** או **להצטרף לערוץ קיים**.
4. שלח את הקוד או את הברקוד לחברים.
5. לחץ על הכפתור האדום והתחל לדבר!

---

## ⌨️ קיצורי מקלדת (Desktop Keyboard Shortcuts)

| מקש | פעולה |
|---|---|
| `Space` | לחיצה והחזקה לשידור PTT מיידי |
| `L` | מעבר בין מצב PTT לנעילת שידור חופשי |
| `M` | השתקה / הפעלה של אפקטי קול |

---

## 🛠️ טכנולוגיות

- **HTML5 & Vanilla CSS3:** ללא ספריות עיצוב כבדות, מהירות תגובה מקסימלית ואנימציות חומרה חלקות.
- **JavaScript (ES6+):** מנוע לוגיקה עצמאי, ללא ספריות בנייה או תלויות npm.
- **Web Audio API:** סינתזה בזמן אמת של צלילים אנלוגיים ללא צורך בקובצי mp3 חיצוניים.
- **WebRTC (PeerJS 1.5.4):** תקשורת קולית מוצפנת בערוץ נתונים ישיר.
- **Html5-Qrcode & QRCode.js:** מחולל וסורק ברקודים קלי משקל.

---

## 📄 רישיון (License)

פרויקט זה מופץ תחת רישיון **MIT**.
פותח בהתאמה אישית עם דגש על איכות, אמינות וחוויית משתמש עילאית.
