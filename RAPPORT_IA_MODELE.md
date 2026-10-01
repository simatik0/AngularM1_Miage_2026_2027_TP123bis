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

## État des livrables TP1 et vérifications

| Livrable demandé | État constaté |
|---|---|
| Code frontend complété | Les pages et le service d'authentification sont présents. Les validations frontend ont été complétées. L'exécution réelle contre MongoDB reste à vérifier par l'étudiant. |
| Schéma annoté du flux de connexion | Présent ci-dessus. |
| Preuve Network d'authentification | À réaliser manuellement : aucune capture navigateur n'a été créée ou vérifiée par l'assistant. |
| Explication Signal / `localStorage` | Présente ci-dessus. |
| Rapport d'usage de l'IA | Complété dans ce document. |

Vérifications réellement effectuées pendant le travail assisté :

- lecture du sujet TP1, du contrat HTTP et des fichiers frontend/backend cités
  dans ce rapport ;
- vérification du chemin de code : les méthodes `submit()` retournent avant
  l'appel au service si le formulaire est invalide ;
- `git diff --check` a réussi après les changements des validations frontend.

La compilation Angular n'est pas confirmée : la commande `npm run build` n'a pas
pu démarrer, car les dépendances du frontend (dont `@angular/build`) n'étaient
pas installées dans l'environnement au moment de l'essai. Aucun scénario n'a été
exécuté dans le navigateur avec MongoDB Atlas pendant ce travail. Il faut donc
faire les vérifications manuelles ci-dessous avant de déclarer ces parcours
validés en exécution.

## Captures Network à réaliser manuellement

Aucune capture n'est incluse pour l'instant. Créer le dossier `preuves/tp1/` à
la racine du projet et y enregistrer les captures suivantes. Les liens ci-dessous
sont des emplacements prévus : ils ne pointeront vers une preuve qu'après que
l'étudiant aura créé et ajouté les images.

- Connexion réussie : [preuves/tp1/connexion-reussie.png](./preuves/tp1/connexion-reussie.png)
- Connexion refusée : [preuves/tp1/connexion-refusee.png](./preuves/tp1/connexion-refusee.png)
- Lecture du profil : [preuves/tp1/profil-get.png](./preuves/tp1/profil-get.png)
- Modification du profil (recommandé) : [preuves/tp1/profil-put.png](./preuves/tp1/profil-put.png)

Procédure Chrome ou Edge :

1. Démarrer le backend et le frontend selon le README, puis ouvrir
   `http://localhost:4200`.
2. Ouvrir les DevTools avec `F12` (ou clic droit > **Inspecter**), puis choisir
   l'onglet **Network** / **Réseau**.
3. Cocher **Preserve log** / **Conserver le journal** si disponible. Cliquer sur
   le filtre **Fetch/XHR**. Effacer les anciennes requêtes avec l'icône
   d'effacement avant chaque scénario.
4. **Connexion réussie** : ouvrir la page de connexion, entrer des identifiants
   valides et soumettre le formulaire. Dans Network, sélectionner la ligne
   `login` ou `/api/auth/login`. Dans **Headers / En-têtes**, relever
   `Request Method: POST`, l'URL et le `Status Code` (attendu : `200`). Dans
   **Payload / Charge utile**, le corps JSON est visible. Dans **Response /
   Réponse**, la réponse contient l'utilisateur et le JWT. Le mot de passe du
   payload et la valeur entière du JWT de la réponse doivent être masqués avant
   toute capture.
5. **Connexion refusée** : se déconnecter si nécessaire, revenir à la connexion
   et saisir un email de test et un mot de passe volontairement incorrect.
   Sélectionner `/api/auth/login`, puis regarder **Headers** (attendu : statut
   `401`) et **Response** (message d'identifiants incorrects). Masquer tout de
   même le mot de passe présent dans le payload.
6. **Lecture du profil** : une fois connecté, ouvrir **Profil**. Sélectionner la
   ligne `users/me` de méthode `GET`. Dans **Headers**, vérifier la méthode,
   l'URL, le statut `200` et la présence d'un en-tête `Authorization` commençant
   par `Bearer`. Masquer la valeur complète après `Bearer`.
7. **Modification du profil** : changer le nom et enregistrer. Sélectionner la
   ligne `users/me` de méthode `PUT`. Vérifier le statut `200`, le corps de
   requête contenant le nom et l'en-tête `Authorization`. Masquer le JWT et
   toute donnée personnelle que l'étudiant ne souhaite pas partager.
8. Enregistrer les images dans `preuves/tp1/` avec les noms indiqués plus haut,
   puis vérifier que les liens correspondants ci-dessus s'ouvrent dans le
   dépôt.

Ne jamais laisser apparaître dans une capture un mot de passe, un JWT complet,
le secret JWT ou l'URI MongoDB. Les captures doivent montrer les détails utiles
sans exposer ces valeurs.

## Ce que l'étudiant doit encore vérifier

- Démarrer le backend avec son propre fichier `.env` sans en partager le contenu.
- Démarrer le frontend et vérifier que le proxy vise le bon port du backend.
- Faire les scénarios réels d'inscription, connexion réussie/refusée, chargement
  et modification du profil, puis déconnexion.
- Vérifier les statuts et les échanges dans Network et joindre les captures
  anonymisées prévues ci-dessus.
- Vérifier que la compilation fonctionne après installation des dépendances du
  projet.
- Être capable d'expliquer le schéma et les concepts avec ses propres mots.

## Notes de sécurité pour le rendu

- Ne jamais inclure de JWT réel, mot de passe, secret JWT ou URI MongoDB dans ce
  rapport ou dans une capture.
- Le JWT est un jeton d'accès : une personne qui le possède peut potentiellement
  agir comme le compte jusqu'à son expiration ou sa révocation.
- Le navigateur envoie le JWT dans l'en-tête `Authorization: Bearer <jeton>` sur
  les routes protégées ; la valeur réelle ne doit pas être partagée.
