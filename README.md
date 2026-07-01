# Online Angadi

A lightweight Firebase-powered online shop with two static front ends:

- `index.html` / `app.js` / `public-style.css` for customers.
- `admin.html` / `admin.js` / `admin-style.css` for authenticated administrators.
- `firebase-config.js` centralizes Firebase app, Auth, and Firestore exports.

## How the application works

1. Customers open `index.html`; the app signs in anonymously, reads public products/categories/settings from Firestore, and renders home, products, product details, cart, comments, likes, sharing, and WhatsApp actions.
2. Admins open `admin.html`; Firebase email/password auth gates the dashboard.
3. Admins can manage products, categories, shop content, and WhatsApp settings.
4. Product images are uploaded from local files in the admin panel and saved as Data URLs in Firestore. Each selected image must be JPG, PNG, or WebP and **150 KB or smaller**.

## Admin login setup

The Firebase config in `firebase-config.js` is the active project config for this app. The admin page does not create an admin account automatically; it uses Firebase Authentication Email/Password sign-in.

To log in to `admin.html`:

1. Open Firebase Console for project `online-angadi-003`.
2. Go to **Authentication > Sign-in method** and enable **Email/Password**.
3. Go to **Authentication > Users** and click **Add user**.
4. Enter the admin email and password you want to use.
5. Open `admin.html` and sign in with that exact email and password.

If login still fails, check that your Firebase API key restrictions allow your deployed domain or localhost, and confirm the browser console error code shown by Firebase Auth.

## Firebase rules

- Deploy `firestore.rules` for the Firestore paths used by the public storefront and admin dashboard.
- Deploy `storage.rules` if the project later moves uploaded images from Firestore Data URLs to Firebase Storage.
- The current admin image workflow validates 150 KB files in the browser; Firestore rules also reject Data URL strings above the expected encoded limit.

## Current production-readiness notes

- Configure strict Firebase Auth users and Firestore security rules before launch.
- Move Firebase configuration to environment-specific hosting configuration for larger deployments.
- For high product volume, replace Firestore Data URL image storage with Firebase Storage thumbnails/CDN URLs.
- Pin third-party CSS/JS versions or build local bundles for stronger reliability.
- Add automated browser tests for product creation, image validation, checkout/cart, and admin authentication.

## Suggested file structure

This app is intentionally static, but the responsibilities are now documented clearly:

```text
/
├── index.html            # Public storefront shell
├── app.js                # Public storefront behavior
├── public-style.css      # Public storefront styles
├── admin.html            # Admin dashboard shell
├── admin.js              # Admin dashboard behavior
├── admin-style.css       # Admin dashboard styles
├── firebase-config.js    # Firebase initialization and SDK exports
└── README.md             # Project overview and production checklist
```
