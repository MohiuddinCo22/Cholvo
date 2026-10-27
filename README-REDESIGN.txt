CHOLVO Premium redesign files

WHAT CHANGED
- index.html: added links to the new stylesheet and animation script.
- cholvo-premium.css: premium visual layer, responsive desktop navigation, cards, calculator styling, gradients and motion.
- animations.js: scroll entrance animations with reduced-motion accessibility support.

WHAT WAS PRESERVED
- maps.js and its current road-distance / delivery pricing / COD logic.
- netlify/functions/route.js and Geoapify integration.
- admin.html, firestore.rules, logo.jpg and rider.jpg.

DEPLOY
1. Back up your current GitHub repository first (download ZIP or create a branch).
2. Upload/replace index.html from this package.
3. Add cholvo-premium.css and animations.js at the repository root, next to index.html and maps.js.
4. Leave maps.js, netlify/functions/route.js, admin.html, firestore.rules, logo.jpg and rider.jpg unchanged.
5. Commit changes and wait for Netlify deployment.
6. Test on desktop and phone: menu links, Book delivery, Order anything, merchant login, parcel tracking, calculator road distance, delivery charge and COD.
7. If anything is wrong, revert the commit or restore the backed-up index.html.

SECURITY
Do not upload .env files or expose the Geoapify API key. Keep GEOAPIFY_API_KEY in Netlify environment variables.
