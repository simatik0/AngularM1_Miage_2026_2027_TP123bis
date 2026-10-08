# TD2 — Bibliothèque, upload et lecture audio

Les missions principales de [l’énoncé](./SUJET_ETUDIANT_TP2.md) sont réalisées.
Le backend et le [contrat HTTP](./API_CONTRACT.md) sont conservés.
La solution utilise les outils déjà présents : Signals, Reactive Forms,
HttpClient et CSS. Aucune bibliothèque supplémentaire n’est nécessaire.

## 1. Ce qui a été fait

| Besoin | Réalisation simple |
|---|---|
| Pagination | Cinq pistes par page, requête serveur à chaque navigation, boutons désactivés aux bornes et pendant le chargement. |
| États de la bibliothèque | Signals pour les pistes, la page, le nombre de pages, le chargement et l’erreur. |
| Affichage | `@if` pour chargement/erreur, `@for` pour les cards et `@empty` pour la bibliothèque vide. |
| Validation | Présence, type MIME autorisé, fichier non vide et taille maximale de 25 × 1024 × 1024 octets. |
| Upload | Indicateur d’envoi, bouton et champs désactivés, garde contre le double envoi, erreurs serveur et succès visibles. |
| Après succès | Titre et sélection de fichier vidés, nouvelle requête pour la première page. |
| Cards | Titre, nom original, type MIME, taille convertie en Ko/Mo, date et bouton Lire. |
| Accessibilité | Labels explicites, titres, focus clavier visible, boutons nommés, erreurs annoncées et grille responsive. |
| Lecture | Téléchargement authentifié du seul morceau choisi, titre sélectionné, état de chargement et erreurs HTTP/décodage. |
| Nettoyage | Révocation de l’ancienne ObjectURL et de la dernière à la destruction ; annulation des requêtes encore en cours. |

Le titre reste facultatif : après suppression des espaces autour du titre,
un titre vide utilise le nom du fichier, comme prévu par l’API.

Les seules options ajoutées sont le formatage des tailles et des dates.
Material, le changement de pagination Mongoose, la progression, la suppression,
le filtre et les couvertures restent des approfondissements facultatifs.

## 2. Où se trouve le code ?

| Fichier | Rôle |
|---|---|
| [tracks-page.ts](./frontend-starter/src/app/components/tracks-page/tracks-page.ts) | État de la page, validations et actions `choose`, `load`, `go`, `upload`, `play`, `releaseAudio`. |
| [tracks-page.html](./frontend-starter/src/app/components/tracks-page/tracks-page.html) | Formulaire, cards, pagination, messages et lecteur. |
| [tracks-page.css](./frontend-starter/src/app/components/tracks-page/tracks-page.css) | Grille responsive, présentation et focus. |
| [track.service.ts](./frontend-starter/src/app/shared/services/track.service.ts) | Appels HTTP déjà présents, conservés : `list`, `upload`, `audio`. |
| [auth.interceptor.ts](./frontend-starter/src/app/shared/interceptors/auth.interceptor.ts) | Ajout du JWT aux requêtes HttpClient protégées. |
| [main.ts](./frontend-starter/src/main.ts) | Enregistrement de HttpClient et de l’intercepteur. |
| [proxy.conf.json](./frontend-starter/proxy.conf.json) | Transmission de `/api` vers `http://localhost:3000`. |
| [app.js](./backend/src/app.js) | Pagination, Multer, stockage, authentification et envoi de l’audio. |
| [Track.js](./backend/src/models/Track.js) | Métadonnées MongoDB et propriétaire de la piste. |

## 3. Comment fonctionne la pagination ?

```text
Clic Suivant
  → go(page + 1), après contrôle des bornes
  → load(page)
  → TrackService.list(page, 5)
  → HttpClient GET /api/tracks?page=2&limit=5
  → intercepteur JWT → proxy → API
  → MongoDB : filtre ownerId, tri, skip et limit
  → réponse { items, page, limit, total, pages }
  → mise à jour des Signals → nouvelles cards
```

Le service transmettait déjà correctement `page` et `limit` dans `params`.
La liste affichée est directement `response.items` : aucun `slice` local et
aucun téléchargement de toutes les pistes pour les paginer ensuite.
La page affichée ne change qu’après une réponse réussie. Si une navigation
échoue, un message permet de réessayer sans annoncer une page non reçue.

## 4. Comment fonctionne l’upload ?

1. Le champ fichier déclenche `choose($event)`, qui lit `input.files[0]`.
2. Le composant valide le fichier dès sa sélection, puis à nouveau dans
   `upload()`. L’attribut HTML `accept` aide au choix mais n’est pas une validation.
3. Le formulaire Reactive Forms appelle `upload()` par `ngSubmit`.
4. `uploading()` empêche un second envoi pendant le premier.
5. `TrackService.upload(file, title)` construit un `FormData` contenant
   **exactement `audio` et `title`**, puis appelle `POST /api/tracks`.
6. Le navigateur produit le `Content-Type: multipart/form-data` avec sa
   frontière (`boundary`). Le code ne fixe pas manuellement cet en-tête.
7. L’intercepteur ajoute `Authorization: Bearer …`, et le proxy transmet la requête.
8. Multer écrit le fichier sur disque ; MongoDB conserve ses métadonnées.
9. Après `201`, le formulaire est vidé, le succès est annoncé et `load(1)` est appelé.
   `finalize` réactive les champs même si une erreur survient.

### Contrôles serveur identifiés

Dans [app.js](./backend/src/app.js) :

- `upload.single("audio")` attend un seul fichier sous le nom `audio` ;
- `if (!req.file)` renvoie `400` avec « Fichier audio requis » ;
- `req.body.title` fournit le titre, avec le nom original en secours ;
- `limits.fileSize: MAX_FILE_SIZE` impose `25 * 1024 * 1024` octets ;
- `fileFilter` vérifie les types MIME `audio/mpeg`, `audio/wav`, `audio/x-wav`,
  `audio/ogg`, `audio/mp4` et `audio/x-m4a` ;
- le gestionnaire d’erreurs traduit les erreurs Multer et le format refusé en `400`.

Le frontend reprend ces types MIME. Un type vide ou inconnu est refusé, même
si le nom possède une extension audio : le serveur refuserait également ce type.
Le frontend refuse en plus les fichiers vides, inutilisables pour la lecture.

La validation frontend donne une réponse rapide et évite un transfert inutile.
Elle ne protège pas le serveur : on peut modifier le JavaScript, utiliser une
console ou envoyer directement une requête HTTP. Le serveur doit donc refaire
ses contrôles. Le contrôle MIME existant vérifie le type déclaré ; il ne garantit
pas que les octets constituent un audio décodable. L’erreur du lecteur couvre
aussi ce dernier cas.

## 5. Blob, ObjectURL et lecture authentifiée

```text
Clic Lire sur une card
  → play(track)
  → TrackService.audio(track.id)
  → HttpClient GET /api/tracks/:id/audio, responseType: 'blob'
  → intercepteur : Authorization: Bearer …
  → API : authentification + vérification ownerId
  → res.sendFile(fichier)
  → réception complète de la réponse sous forme de Blob
  → URL.createObjectURL(blob)
  → audioUrl.set(url)
  → <audio [src]="audioUrl()" controls autoplay>
```

Un **Blob** est un objet contenant des données binaires, ici les octets de
l’audio et son type MIME. Une **ObjectURL** est une adresse locale temporaire,
par exemple `blob:http://localhost:4200/...`, qui permet au lecteur d’accéder
à ce Blob. Ce n’est ni un nouvel upload ni une URL publique du serveur.

Le lecteur dispose de commandes natives. Si le navigateur bloque le démarrage
automatique, l’utilisateur peut appuyer sur sa commande Lecture.

### Pourquoi ne pas mettre directement l’URL API dans src ?

L’intercepteur Angular ne traite que les requêtes qui passent par **HttpClient**.
Avec `<audio src="/api/tracks/ID/audio">`, c’est le navigateur qui demande la
ressource directement. Cette requête ne passe pas par l’intercepteur et le JWT
stocké par l’application n’est pas ajouté automatiquement. Avec l’authentification
Bearer actuelle, une telle requête sans en-tête reçoit `401`.

La solution existante télécharge donc l’audio avec HttpClient et le JWT,
puis donne une URL locale au lecteur. Le serveur vérifie aussi
`{ _id: req.params.id, ownerId: req.auth.sub }` : être connecté ne suffit pas,
il faut posséder la piste. Un autre utilisateur reçoit `404`.

### Comment les ressources sont-elles libérées ?

Avant une nouvelle lecture, le composant annule le téléchargement précédent
et appelle `releaseAudio()`. Cette méthode révoque l’URL précédente avec
`URL.revokeObjectURL` et vide le Signal. `DestroyRef.onDestroy` appelle la même
méthode quand on quitte la page. `takeUntilDestroyed` annule également les
abonnements encore actifs, afin qu’une réponse tardive ne crée pas une nouvelle
URL après la destruction. Une erreur de décodage libère aussi l’URL.

## 6. Réponses : mémoire, buffering et streaming

**Le backend charge-t-il tout le fichier en mémoire ?**

La route utilise `res.sendFile(audioPath)`. Express peut lire et envoyer le
fichier progressivement depuis le disque ; le code ne fait pas un `readFile`
pour construire un gros Buffer avant l’envoi. Il existe néanmoins des buffers
de travail pendant le transfert. Les métadonnées sont dans MongoDB, les octets
audio dans le dossier d’uploads du serveur.

**Quand HttpClient remet-il le Blob au composant ?**

Avec l’appel actuel, `responseType: 'blob'` et l’observation du corps par défaut,
`next(blob)` intervient après la réception complète du corps de la réponse.
Le composant n’obtient pas une suite de morceaux audio pendant le téléchargement.
Le serveur peut envoyer progressivement, mais cette interface attend le Blob
complet avant d’afficher le lecteur.

**Afficher 100 pistes charge-t-il 100 fichiers audio en mémoire ?**

Non. `list()` demande uniquement du JSON : titre, taille, date, identifiant, etc.
Ici, seules cinq métadonnées de pistes sont affichées par page. `audio(id)` n’est
appelé que dans `play(track)`, déclenché par Lire. Les cards ne contiennent aucun
lecteur ni URL audio. Il y a un seul lecteur partagé pour la sélection courante.

**Et avec 100 éléments audio ayant directement une URL HTTP ?**

Chaque élément serait un lecteur indépendant, susceptible d’effectuer ses propres
requêtes et de conserver ses propres données. `preload="none"`, `"metadata"` ou
`"auto"`, les actions de l’utilisateur et les décisions du navigateur influencent
ce qui est chargé. Cent lecteurs ne signifient donc pas automatiquement cent
fichiers entièrement téléchargés, mais peuvent créer beaucoup plus de requêtes
et de buffers. Le navigateur peut demander des portions de fichier avec `Range`
si le serveur le permet. Le problème du JWT décrit plus haut resterait à résoudre.

**Quelle différence entre streaming et buffering ?**

Le streaming désigne ici l’envoi progressif des octets depuis le serveur.
Le buffering consiste à garder des données disponibles pour alimenter le
lecteur et son décodage. Avec une URL HTTP directe, le navigateur peut commencer
la lecture avant la fin du transfert lorsqu’il dispose de données suffisantes.
Notre parcours attend le téléchargement du Blob ; le lecteur gère ensuite ses
buffers de décodage à partir de cette ressource locale. Ce n’est pas un lecteur
de streaming adaptatif de type HLS/DASH.

**Pourquoi révoquer les ObjectURL ?**

Chaque URL créée conserve une référence exploitable vers son Blob. Remplacer
seulement la chaîne dans le Signal ne révoque pas l’ancienne URL. La révocation
permet au navigateur de libérer les ressources lorsqu’il n’en a plus besoin.
Le stockage d’un Blob peut utiliser la mémoire ou le disque selon le navigateur :
on ne peut pas assimiler sa taille à une quantité exacte de RAM JavaScript.

## 7. Essayer et présenter le TD

L’application de cette session est servie sur <http://127.0.0.1:4202> et le
backend sur <http://localhost:3000>. Le backend a été lancé avec la configuration
locale existante du dépôt principal, sans copier ses secrets dans cette branche.

Pour un lancement habituel, suivre le [README](./README.md) : configurer
l’environnement local du backend, lancer `npm start` dans chaque application.
Le frontend utilise alors le port 4200 par défaut. Les deux fichiers de test
sont fournis dans [fichiers-audio-de-test](./frontend-starter/fichiers-audio-de-test).

1. Se connecter puis ouvrir la bibliothèque.
2. Importer au moins six pistes (on peut réutiliser les fichiers de test).
3. Ouvrir les outils du navigateur, onglet **Network**, filtre `tracks`.
4. Cliquer Suivant puis Précédent : vérifier `page=2`, `page=1` et `limit=5`.
5. Importer un fichier : vérifier `POST`, `201` et les champs `audio`/`title`
   dans Payload. Vérifier le formulaire vidé et le retour à la première page.
6. Cliquer Lire : vérifier `GET .../audio`, la réponse audio et l’en-tête
   Authorization. Éviter d’inclure la valeur du JWT dans une capture partagée.
7. Essayer un fichier texte : le frontend doit l’arrêter avant l’envoi.
   Tester séparément un multipart invalide pour vérifier le `400` du serveur.
8. Tester l’URL d’une piste avec un autre compte : `404`, et sans JWT : `401`.

Les résultats observés et les captures se trouvent dans
[le compte rendu des vérifications](./preuves/tp2/verification.md).
L’utilisation de l’IA est détaillée dans [le rapport IA](./RAPPORT_IA_MODELE.md).
