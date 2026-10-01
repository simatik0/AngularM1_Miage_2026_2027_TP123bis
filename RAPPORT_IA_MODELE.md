# Rapport d'usage de l'IA - TP1

## Mission 0 — Cartographie

### Objectif

Identifier le composant racine, les routes, l'enregistrement de `HttpClient`, les modèles, les services, les pages et le mécanisme d'ajout du JWT.

### Résultat

- Composant racine : `frontend-starter/src/app/components/app/app.ts`.
- Routes : `frontend-starter/src/app/routes.ts`.
- `HttpClient` et interceptor : `frontend-starter/src/main.ts`.
- Service d'authentification : `frontend-starter/src/app/shared/services/auth.service.ts`.
- Guard : `frontend-starter/src/app/shared/guards/auth.guard.ts`.
- Proxy : `frontend-starter/proxy.conf.json`, cible `http://localhost:3000`.
- API : `backend/src/app.js`.

### Schéma annoté du flux de connexion

```text
[LoginPageComponent]
        |
        | AuthService.login(email, password)
        v
[HttpClient Angular]
        |
        | authInterceptor : pas de JWT pour /api/auth/login
        v
[proxy.conf.json]
        |
        | /api -> http://localhost:3000
        v
[Express : POST /api/auth/login]
        |
        v
[MongoDB : recherche et vérification de l'utilisateur]
        |
        | { token, user }
        v
[AuthService.storeAuthentication()]
        |
        +--> localStorage["gpc_token"] : persistance après refresh
        +--> token Signal : état réactif
        +--> currentUser Signal : utilisateur courant
        |
        v
[Interface Angular : navigation connectée et /tracks]
```

Pour les routes protégées, l'interceptor clone la requête et ajoute
`Authorization: Bearer <token>`. Le middleware `auth` d'Express vérifie ensuite
le JWT. Le guard Angular améliore l'expérience utilisateur mais ne constitue
pas une sécurité serveur.

## Mission 1 — Inscription, connexion et profil

### Objectif

Utiliser des Reactive Forms, centraliser les appels HTTP dans `AuthService`,
conserver la session avec `localStorage`, afficher un état réactif et gérer le
profil utilisateur.

### Prompt principal utilisé

> Relier correctement le frontend Angular au backend Express pour gérer la
> connexion, la conservation de l'authentification, l'envoi automatique du JWT,
> l'état connecté/déconnecté, la déconnexion et les erreurs 401, en respectant
> le contrat HTTP et Angular standalone.

### Fichiers effectivement modifiés

- `frontend-starter/src/app/components/app/app.html`
- `frontend-starter/src/app/components/app/app.ts`
- `frontend-starter/src/app/components/login-page/login-page.ts`
- `frontend-starter/src/app/components/register-page/register-page.ts`
- `frontend-starter/src/app/components/profile-page/profile-page.html`
- `frontend-starter/src/app/components/profile-page/profile-page.ts`
- `frontend-starter/src/app/shared/guards/auth.guard.ts`
- `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`
- `frontend-starter/src/app/shared/services/auth.service.ts`
- `frontend-starter/src/styles.css`

### Vérifications réalisées

- `npm run build` exécuté depuis `frontend-starter` avec succès.
- Le proxy conserve la cible `http://localhost:3000`.
- Les routes `/profile` et `/tracks` restent protégées.
- Le mot de passe et le JWT ne sont pas écrits dans les logs frontend.
- Une réponse `401` sur une requête protégée déclenche le nettoyage local et
  la navigation vers `/login`.
- Le profil est chargé automatiquement à l'ouverture de `/profile`.

### Preuves navigateur à joindre avant rendu

Effectuer les scénarios suivants dans DevTools > Network et ajouter les captures
dans ce dossier, en masquant les données sensibles :

1. `POST /api/auth/login` réussi : statut `200`, corps de requête sans capture
   du mot de passe, réponse avec `token` masqué.
2. `POST /api/auth/login` refusé : statut `401`.
3. `GET /api/users/me` : statut `200`, header `Authorization` visible mais
   valeur du JWT masquée.
4. `PUT /api/users/me` : statut `200`.

Les captures ne doivent jamais contenir le mot de passe, le JWT complet, l'URI
MongoDB ou le secret JWT.

### Ce que le binôme doit savoir expliquer

- `localStorage` persiste une valeur entre les rechargements ; un Signal expose
  un état réactif à Angular.
- Le composant ne connaît pas les détails HTTP : il appelle `AuthService`.
- Le proxy évite de mettre `localhost:3000` dans les composants.
- Le guard protège la navigation, tandis que le middleware Express protège
  réellement les données.
- `logout()` supprime le token persistant et réinitialise les Signals.

## Bilan

Le code frontend et le build sont terminés. Il reste à réaliser les vérifications
d'environnement et à joindre les captures Network anonymisées demandées par le
sujet. Le rapport doit être complété par les preuves du binôme après exécution
avec le backend et MongoDB Atlas.
