CHOLVO Premium Website Redesign

Included:
- index.html: refreshed responsive landing page; existing Firebase/order/tracking UI and form IDs retained
- cholvo-reference.css: premium cream, navy and orange design, responsive layout, hover and scroll effects
- animations.js: reduced-motion-aware entrance animations
- maps.js: Geoapify road-distance logic retained; latest shared pricing tiers applied (up to 1 km ৳80, 2 km ৳100, 3 km ৳120, 5 km ৳140, then +৳10 per extra km; COD 1%)
- netlify/functions/route.js: retained Geoapify Netlify function
- admin.html, firestore.rules, logo.jpg, rider.jpg: retained

Deploy notes:
1. Back up the current GitHub repository first.
2. Upload/replace the files in the root with these versions; retain the netlify/functions folder.
3. Keep GEOAPIFY_API_KEY configured in Netlify Environment Variables. Never commit the API key.
4. Deploy, then test: menu, book delivery, order anything, merchant login/registration, calculator, tracking (CHV-DEMO), and admin page.

Important: this package preserves existing IDs and script logic, but a live Firebase/Netlify browser test has not been performed in this environment. Test on a deploy preview before publishing.
