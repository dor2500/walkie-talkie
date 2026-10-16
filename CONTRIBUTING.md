# מדריך תרומה לפרויקט (Contributing Guide)

תודה על הרצון לתרום לפיתוח ווקי-טוקי טקטי!

## כיצד לתרום?

1. **דיווח על באגים:** פתח [Issue חדש](https://github.com/dor2500/walkie-talkie/issues) ותאר את הבעיה, כולל סוג הדפדפן והמכשיר.
2. **הצעת תכונות חדשות:** נשמח לשמוע רעיונות לשיפור חוויית הקשר.
3. **פיתוח קוד:**
   - צור Fork של המאגר.
   - פתח ענף חדש: `git checkout -b feature/my-new-feature`.
   - בצע Commit עם הודעה ברורה: `git commit -m 'feat: add new tactical frequency selector'`.
   - דחוף לענף שלך: `git push origin feature/my-new-feature`.
   - פתח Pull Request מפורט.

## עקרונות קוד (Code Guidelines)
- שמירה על עצמאות מוחלטת ללא תלויות שרת (Serverless / Static).
- כתיבה מודולרית בתיקיית `assets/js/`.
- תמיכה מלאה בעברית (RTL) ובכל גדלי המסכים.
