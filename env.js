/* CHOLVO environment switch.
   Staging ONLY for the hosts listed below. Everything else (cholvo.pages.dev,
   GitHub Pages, custom domains) stays PRODUCTION. */
(function(){
  var h=location.hostname;
  var STAGING=h==='localhost'||h==='127.0.0.1'
    ||/\.app\.github\.dev$/.test(h)          // GitHub Codespaces
    ||/\.cholvo\.pages\.dev$/.test(h);       // Cloudflare preview / branch deploys (NOT cholvo.pages.dev itself)
  var PROD={apiKey:'AIzaSyC5cZRg2y8uciG2IqCNfNUBbO1SdI-rxL4',authDomain:'chovo-35252.firebaseapp.com',projectId:'chovo-35252',appId:'1:324753082605:web:5b511ba890467441c524e4'};
  var STG={apiKey:'AIzaSyC2v6nsEdesLuRXg-xMRFRbUFkxq3_umkY',authDomain:'cholvo-staging.firebaseapp.com',projectId:'cholvo-staging',storageBucket:'cholvo-staging.firebasestorage.app',messagingSenderId:'155242881751',appId:'1:155242881751:web:1b459c548f22806db20692'};
  window.IS_STAGING=STAGING;
  window.CFG=STAGING?STG:PROD;
  if(STAGING){
    document.title='[STAGING] '+document.title;
    window.addEventListener('DOMContentLoaded',function(){
      var b=document.createElement('div');
      b.textContent='STAGING — test data only (cholvo-staging)';
      b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#d90429;color:#fff;font:700 13px/26px sans-serif;text-align:center;letter-spacing:.5px;pointer-events:none';
      document.body.appendChild(b);
    });
  }
})();
