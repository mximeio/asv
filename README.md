# Espace ASV

Application web (PWA) de suivi d'activité pour auxiliaire spécialisé
vétérinaire : **décompte mensuel des heures de garde** d'un côté, **planning des
week-ends d'équipe** de l'autre. Pensée pour un usage quotidien sur iPhone
(ajout à l'écran d'accueil) comme sur ordinateur.

## Ce que fait l'application

- Saisie des gardes jour par jour : début, fin, heures admin — tout le reste
  (total, nuit, dimanches, jours fériés, changements d'heure) est calculé
  automatiquement.
- Détection d'anomalies de saisie et commentaires par jour, regroupés dans un
  panneau "À vérifier".
- Statistiques et bilan annuel, en tableau ou en graphique multi-années.
- Préremplissage depuis un calendrier Google Agenda (lecture seule, avec aperçu
  avant écriture — la saisie manuelle n'est jamais écrasée sans confirmation).
- Export / import JSON, impression propre.

## Technique, en bref

HTML / CSS / JavaScript sans framework et **sans étape de build** ; Chart.js en
CDN pour les graphiques. Côté serveur : **Firebase** uniquement (Authentication
e-mail/mot de passe + Firestore). Il suffit d'un hébergement statique en HTTPS.

```
Application/
├── index.html            structure HTML + numéro de version
├── styles.css            tout le CSS
├── js/
│   ├── decompte.js       module Décompte, login, Google Agenda
│   └── weekend.js        module Planning week-end
├── manifest.webmanifest  manifeste PWA
└── icônes png
```

## Mise en route

1. Créer un projet Firebase, y ajouter une application web.
2. Activer Authentication (e-mail / mot de passe) et créer les comptes depuis
   la console.
3. Activer Firestore et publier les règles ci-dessous.
4. Coller votre `firebaseConfig` en tête de `js/decompte.js`.
5. Héberger le dossier tel quel (Firebase Hosting ou équivalent).

Les fonctionnalités sensibles s'activent par utilisateur via un document
Firestore `access/{uid}` créé à la main : champ `weekend` pour le planning,
champ `agenda` pour le préremplissage Google, champ `decompte` pour afficher ou
masquer l'onglet Décompte (affiché s'il est absent).

<details>
<summary><b>Règles Firestore à publier</b></summary>

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function hasWeekend() {
      return request.auth != null
        && exists(/databases/$(database)/documents/access/$(request.auth.uid))
        && get(/databases/$(database)/documents/access/$(request.auth.uid)).data.weekend == true;
    }
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /access/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
    match /plannings/{planningId} {
      allow read, write: if hasWeekend();
    }
  }
}
```
</details>

<details>
<summary><b>Préremplissage Google Agenda (optionnel)</b></summary>

Dans la console Google Cloud du même projet : activer l'API Google Calendar,
configurer l'écran de consentement (mode « test » suffisant) et créer un ID
client OAuth « Application Web » avec l'origine du site autorisée. Coller cet
ID dans la constante `GCAL_CLIENT_ID` de `js/decompte.js`, puis donner le droit
`agenda` aux utilisateurs concernés. L'accès demandé est en lecture seule.
</details>

## Bon à savoir

- **Mise en production** : incrémenter le numéro `APP VERSION` en tête
  d'`index.html` et reporter ce numéro sur tous les `?v=` (index **et**
  manifest) — c'est ce qui force les PWA iOS à se rafraîchir.
- Les règles de calcul (nuit « tout ou rien », seuils week-end/férié…)
  correspondent à un contexte de travail précis : adaptez-les à votre convention
  avant tout usage réel.
- Projet personnel, partagé tel quel, sans garantie.
