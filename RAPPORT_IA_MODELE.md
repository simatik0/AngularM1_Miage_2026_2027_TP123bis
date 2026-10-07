# Rapport d'usage de l'IA — TP1

## Utilisation de l'assistant IA

Un assistant IA a été utilisé pour analyser l'architecture du frontend Angular et
les routes d'authentification du backend, puis pour compléter les validations des
formulaires d'inscription, de connexion et de modification du profil.

Les modifications assistées par IA décrites dans cette entrée concernent :

- `frontend-starter/src/app/components/register-page/register-page.ts` et `.html` :
  validations du nom, de l'email et du mot de passe, messages par champ et
  suppression des espaces autour du nom avant envoi ;
- `frontend-starter/src/app/components/login-page/login-page.ts` et `.html` :
  messages par champ pour l'email et le mot de passe, sans appel au service si le
  formulaire est invalide ;
- `frontend-starter/src/app/components/profile-page/profile-page.ts` et `.html` :
  validation du nom après suppression des espaces autour, message d'erreur
  associé et envoi du nom nettoyé.

Les fonctionnalités d'authentification déjà présentes (service, interceptor,
guard, routes et endpoints serveur) ont été lues pour comprendre et documenter le
flux. Elles n'ont pas été réécrites lors de cette correction des validations.
L'étudiant doit relire les changements, les tester et être capable de les
expliquer.

## Cartographie du projet

- Composant racine et bouton de déconnexion :
  `frontend-starter/src/app/components/app/app.ts` et `app.html`.
- Routes Angular :
  `frontend-starter/src/app/routes.ts`.
- Démarrage de l'application, `HttpClient`, interceptor et restauration initiale :
  `frontend-starter/src/main.ts`.
- Pages d'inscription, de connexion et de profil :
  `frontend-starter/src/app/components/register-page/`,
  `frontend-starter/src/app/components/login-page/` et
  `frontend-starter/src/app/components/profile-page/`.
- Service qui centralise les appels d'authentification et de profil :
  `frontend-starter/src/app/shared/services/auth.service.ts`.
- Interceptor JWT :
  `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`.
- Guard des pages privées :
  `frontend-starter/src/app/shared/guards/auth.guard.ts`.
- API et middleware d'authentification :
  `backend/src/app.js`.
- Modèle utilisateur et hachage des mots de passe :
  `backend/src/models/User.js`.
- Modèle des jetons révoqués :
  `backend/src/models/RevokedToken.js`.
- Cible du proxy Angular :
  `frontend-starter/proxy.conf.json` (`http://localhost:3000` par défaut).

## Schéma annoté du flux de connexion

```text
Utilisateur
    |
    | saisit email et mot de passe, puis clique sur « Se connecter »
    v
LoginPageComponent.submit()
    |
    | vérifie le formulaire, puis appelle AuthService.login(email, password)
    v
AuthService.login()
    |
    | HttpClient envoie POST /api/auth/login
    v
Proxy Angular (/api -> http://localhost:3000)
    |
    v
API Express : route POST /api/auth/login
    |
    | cherche l'utilisateur dans MongoDB et vérifie son mot de passe
    v
MongoDB / modèle User
    |
    | si correct : réponse { token, user }
    v
AuthService.storeAuthentication()
    |
    +--> localStorage["gpc_token"] : garde le JWT après un rafraîchissement
    +--> Signal token : informe Angular de l'état du jeton
    +--> Signal currentUser : informe l'interface de l'utilisateur connecté
    |
    v
LoginPageComponent redirige vers /tracks
```

Explication étape par étape :

1. La connexion commence dans `login-page.html` quand l'utilisateur soumet le
   formulaire. `login-page.ts` lit les valeurs avec `form.getRawValue()`.
2. `LoginPageComponent` appelle `AuthService.login()` au lieu de parler au
   serveur directement. Le service garde les détails des requêtes HTTP à un seul
   endroit.
3. `HttpClient` est l'outil Angular qui envoie une requête HTTP au serveur. Ici,
   il envoie `POST /api/auth/login` avec l'email et le mot de passe dans le corps
   JSON de la requête.
4. Le proxy transmet `/api` au backend local. L'API Express reçoit la demande,
   cherche l'email dans MongoDB et compare le mot de passe reçu au mot de passe
   haché enregistré. Un mauvais identifiant produit une réponse `401`.
5. Si les identifiants sont corrects, le backend répond avec les données
   publiques de l'utilisateur et un JWT. Le mot de passe n'est pas placé dans le
   JWT ni dans les données publiques retournées.
6. `AuthService` reçoit la réponse et enregistre le JWT sous la clé
   `gpc_token` dans le navigateur. Il met aussi à jour ses Signals `token` et
   `currentUser`.
7. Le composant de connexion redirige vers `/tracks`. L'interface peut alors
   afficher l'état connecté et les prochaines requêtes protégées peuvent porter
   le JWT.

Routes d'authentification/profil côté backend dans `backend/src/app.js` :

- `POST /api/auth/register` : crée le compte et renvoie `{ token, user }` ;
- `POST /api/auth/login` : vérifie les identifiants et renvoie `{ token, user }` ;
- `POST /api/auth/logout` : révoque le JWT courant et répond `204` ;
- `GET /api/users/me` : renvoie le profil public du compte associé au JWT ;
- `PUT /api/users/me` : met à jour le nom du compte associé au JWT ;
- `GET /api/health` : vérifie que l'API répond.

## Signal et localStorage : deux rôles différents

| Élément | Explication simple | Dans ce projet |
|---|---|---|
| Signal Angular | Une valeur suivie par Angular. Quand elle change, l'interface peut se mettre à jour automatiquement. | `currentUser` contient l'utilisateur actuellement connu par l'application. |
| `localStorage` | Un petit espace de stockage du navigateur qui survit à un rechargement de page. | La clé `gpc_token` conserve le JWT pour retrouver la session. |

Exemple : après la connexion, `currentUser` permet à l'en-tête de montrer le nom
de la personne connectée sans recharger toute la page. Si l'utilisateur fait
F5, les Signals repartent en mémoire depuis le démarrage de l'application.
`AuthService` relit alors `gpc_token` dans `localStorage`, puis appelle
`GET /api/users/me` pour demander au serveur si le jeton fonctionne encore et
pour recharger le profil. Si le serveur refuse le jeton, la session locale est
effacée.

Le Signal n'est donc pas un stockage durable, et `localStorage` ne met pas tout
seul l'interface à jour. Ils se complètent : l'un sert à l'interface en cours,
l'autre conserve le jeton entre deux chargements.

## État des livrables TP1 — mise à jour du 7 octobre 2026

Les imports `AbstractControl`, `ValidationErrors` et `ValidatorFn` des pages
inscription et profil ont été corrigés pour provenir de `@angular/forms`.
L'assistant a installé les dépendances, ajouté jsdom, configuré la cible de test
et séparé la compilation de l'application de celle des tests. Six tests
vérifient connexion, inscription, modification du profil, refus de connexion,
nettoyage après 401, déconnexion en erreur et restauration de session.

Résultats : compilation Angular réussie, 6 tests frontend réussis, 3 tests
backend réussis. Les tests frontend simulent l'API ; les tests backend existants
ne nécessitent pas de connexion MongoDB.

Les parcours réels ont ensuite été exercés dans le navigateur sur le frontend
de cette branche, port 4201, avec le backend existant sur le port 3000.
Inscription, connexion acceptée/refusée, lecture et modification du profil,
persistance après rechargement, déconnexion et rejet d'un jeton invalide ont
fonctionné. L'hébergement Atlas de la base n'a pas été vérifié.

Preuves et détails : [compte rendu des vérifications](./preuves/tp1/verification.md)
et [capture du profil](./preuves/tp1/profil-interface.png).

| Livrable | État |
|---|---|
| Code frontend | Corrigé, compilé et parcours principaux vérifiés |
| Schéma annoté | Présent ci-dessus |
| Signal et localStorage | Explication présente ci-dessus |
| Rapport IA | Actualisé avec les actions et résultats réellement observés |
| Capture Network d'authentification | Ajoutée ci-dessous, avec les captures de connexion refusée et de modification du profil |

## Captures Network — 7 octobre 2026

Les trois captures suivantes ont été fournies par l'étudiant et intégrées au
rapport avec l'aide de l'assistant IA. Elles montrent l'application sur
`http://localhost:4200` et les détails des requêtes dans l'onglet Network.

### Connexion réussie

La requête `POST /api/auth/login` retourne **200 OK**. L'application affiche
la bibliothèque et l'état connecté après la connexion.

![Connexion réussie : POST /api/auth/login, statut 200 OK](./preuves/tp1/network-connexion-reussie.png)

### Connexion refusée

La requête `POST /api/auth/login` retourne **401 Unauthorized**. L'utilisateur
reste sur la page de connexion et le message « Identifiants incorrects » apparaît.

![Connexion refusée : POST /api/auth/login, statut 401 Unauthorized](./preuves/tp1/network-connexion-refusee.png)

### Modification du profil

La requête `PUT /api/users/me` retourne **200 OK**. Le nom modifié apparaît
dans le profil et l'en-tête, avec le message « Votre nom a bien été mis à jour. ».

![Modification du profil : PUT /api/users/me, statut 200 OK](./preuves/tp1/network-modification-profil.png)

Ces captures montrent les méthodes, URL et statuts. Les corps JSON et le header
`Authorization` ne sont pas visibles dans les zones capturées ; les observations
HTTP antérieures sont détaillées dans le [compte rendu](./preuves/tp1/verification.md).
Aucun mot de passe en clair ni JWT n'est visible dans ces trois images.

Chaque membre du binôme doit également pouvoir expliquer le flux, les fichiers
impliqués et les modifications avec ses propres mots. Le modèle réellement
utilisé et la consommation de tokens sont à relever dans l'outil de l'étudiant ;
aucun chiffre de consommation n'a été inventé dans ce rapport.
