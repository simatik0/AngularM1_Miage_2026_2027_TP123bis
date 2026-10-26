<div align="center">

# Guitar Practice Cloud

### Votre bibliothèque audio pour travailler la guitare

**Projet réalisé par Salima Mazaev · Groupe de TD 2**

Application Angular connectée à une API Express et MongoDB pour gérer un compte,
importer des pistes audio, les retrouver et les écouter.

</div>

---

## Le projet en un coup d'œil

Guitar Practice Cloud est un espace personnel de backing tracks. Le projet met
en pratique les trois travaux dirigés : authentification et profil (TP1),
bibliothèque audio (TP2), puis fiabilisation, suppression et progression
d'upload (TP3).

> **Pour la correction :** les captures des parcours et des requêtes sont
> intégrées ci-dessous. Les comptes rendus détaillés, résultats de tests et
> limites de vérification sont disponibles dans [`preuves/`](./preuves/).

### Parcours fonctionnels présentés

| TP | Fonctionnalités réalisées | Preuves dans ce README |
|---|---|---|
| **TP1 — Compte et profil** | Inscription, connexion/déconnexion, gestion des erreurs, profil connecté et modification du nom. | Réussite et refus de connexion, profil et requête de mise à jour. |
| **TP2 — Bibliothèque audio** | Pagination côté serveur, import multipart, validation des fichiers, lecture authentifiée et interface responsive. | Cards, requêtes de pagination, lecture, erreurs et affichage mobile. |
| **TP3 — Fiabilisation** | Suppression avec confirmation et retour utilisateur, progression d'upload et tests automatisés indépendants de MongoDB. | Requêtes DELETE/GET, progression et bilans de tests. |

## Démonstration et captures d'écran

Les images ci-dessous sont les captures conservées dans le dépôt. Les captures
Network illustrent les échanges HTTP observés dans le navigateur ; les
comptes rendus de vérification précisent le contexte, les statuts et les
éventuelles limites de chaque preuve. Les parcours API ont été testés avec le
backend local ; la configuration Atlas n'a pas été certifiée indépendamment
(voir le rapport TP1).

### TP1 — Authentification et profil

**Connexion acceptée et connexion refusée** — la seconde capture montre
l'erreur d'authentification sans exposer de mot de passe.

| Connexion réussie | Connexion refusée |
|---|---|
| ![Requête de connexion réussie](./preuves/tp1/network-connexion-reussie.png) | ![Requête de connexion refusée](./preuves/tp1/network-connexion-refusee.png) |

**Profil réactif et modification du nom** — l'interface affiche le nom
enregistré ; la capture Network montre la requête `PUT /api/users/me`.

![Profil après modification](./preuves/tp1/profil-interface.png)

![Requête Network de modification du profil](./preuves/tp1/network-modification-profil.png)

Les autres étapes vérifiées — inscription (`201`), déconnexion (`204`) et
traitement d'un jeton invalide (`401`) — sont consignées dans
[le rapport de vérification TP1](./preuves/tp1/verification.md).

### TP2 — Bibliothèque, upload et lecture audio

**Bibliothèque paginée** — les pistes sont présentées sous forme de cards avec
leurs informations et une action de lecture.

![Bibliothèque de pistes audio](./preuves/tp2/bibliotheque.png)

**Pagination serveur** — les paramètres `page` et `limit` changent lors du
passage d'une page à l'autre ; les preuves détaillées consignent les statuts
observés.

![Requêtes Network de pagination](./preuves/tp2/network-pagination.png)

**Lecture authentifiée** — le lecteur affiche le morceau sélectionné. Le
téléchargement audio protégé et son autorisation sont documentés séparément
dans le compte rendu TP2.

![Lecture d'une piste audio](./preuves/tp2/lecture-authentifiee.png)

**Validation des fichiers et erreurs** — les formats non acceptés sont
signalés avant l'envoi ; la réponse serveur `400` dispose également d'une
preuve dédiée.

| Validation dans l'interface | Réponse `400` de l'API |
|---|---|
| ![Message de validation d'un fichier audio](./preuves/tp2/validation-fichier.png) | ![Message correspondant à une erreur serveur 400](./preuves/tp2/erreur-serveur-400.png) |

**Responsive** — capture de la bibliothèque à une largeur mobile de 390 px.

![Bibliothèque sur écran mobile](./preuves/tp2/mobile.png)

### TP3 — Suppression et progression

**Suppression** — la première capture montre `DELETE` accepté (`204`), la
seconde la requête de rechargement de la bibliothèque.

| Suppression de piste | Rechargement de la bibliothèque |
|---|---|
| ![Requête DELETE de suppression](./preuves/tp3/suppression-delete-network.png) | ![Requête de rechargement après suppression](./preuves/tp3/suppression-rechargement-network.png) |

**Upload avec progression** — la capture associe l'envoi du fichier à la
progression visible dans l'interface.

![Upload avec progression dans le navigateur](./preuves/tp3/upload-progress-network.png)

> **Précision sur la preuve de suppression :** la capture confirme la réponse
> `204` et un rechargement `GET`. Le rapport TP3 indique que ces images ne
> suffisent pas, à elles seules, à prouver visuellement que la piste concernée
> a disparu de la liste ; cette réserve est conservée dans
> [`preuves/tp3/verification.md`](./preuves/tp3/verification.md).

## Fonctionnalités ajoutées au-delà des TP

Les éléments ci-dessous complètent les parcours demandés. Ils sont conçus
autour de l’usage d’une bibliothèque de backing tracks pour travailler un
morceau et ne reposent pas sur un service d’analyse audio externe.

### Analyse musicale automatique à l’import

Avant l’envoi du fichier, le navigateur le décode avec l’API Web Audio
(`AudioContext`). Le signal stéréo est ramené en mono pour appliquer les mêmes
calculs à chaque canal. L’analyse est locale : seuls les résultats et le fichier
audio sont ensuite transmis à l’API.

- **Tempo (BPM)** : le signal est découpé en fenêtres d’environ 10 ms. Pour
  chacune, le service calcule l’énergie RMS puis les variations positives
  d’énergie, qui servent d’indice d’attaque. Il compare ces attaques par
  autocorrélation pour des tempos de 55 à 200 BPM et retient le tempo au score
  le plus élevé. Si le signal est trop court ou ne donne pas de résultat
  exploitable, le BPM reste non renseigné.
- **Tonalité** : une FFT est calculée sur des fenêtres de 4096 échantillons
  (jusqu’aux 90 premières secondes). Les fréquences sont regroupées en 12
  classes de notes, puis le profil obtenu est comparé à des profils de
  référence majeur et mineur. Le meilleur score fournit une estimation de
  tonalité, et non une transcription ou une garantie d’analyse musicale
  parfaite.
- **Forme d’onde** : les échantillons sont répartis en 128 segments. Le pic
  d’amplitude de chaque segment est normalisé entre 0 et 1. Ces valeurs sont
  conservées avec la piste pour représenter son signal dans la bibliothèque.

L’interface désactive le formulaire pendant l’analyse et l’envoi, présente
leur état, puis affiche la progression HTTP de l’upload. L’API valide les
valeurs reçues avant de les enregistrer avec la piste.

### Bibliothèque enrichie, filtres et favoris

La recherche rapproche le texte saisi du titre et du nom d’origine du fichier.
Les filtres combinables portent sur le format, la date d’ajout, une plage de
BPM, la tonalité, l’accordage, le genre et le niveau ; le tri peut se faire par
date récente/ancienne, titre ou tempo. Ces opérations sont calculées sur les
pistes de la page actuellement chargée par la pagination serveur, et non sur
les pages qui ne sont pas encore chargées.

Le bouton cœur ajoute ou retire une piste des favoris et le filtre « Favoris »
permet de ne garder que ces pistes. Dans cette version, la sélection des
favoris reste en mémoire dans le composant de bibliothèque : elle est perdue
en quittant cette page ou en rechargeant.

Les BPM, tonalités, accordages, genres et niveaux restent modifiables
manuellement depuis chaque piste. C’est notamment utile pour corriger une
estimation automatique. Le formulaire vérifie les bornes du BPM puis envoie
les métadonnées à l’API, qui les valide et les enregistre avec la piste.

![Filtres et tri de la bibliothèque](./preuves/fonctionnalites/filtres-musicaux.png)

### Playlists et file d’attente

Depuis le menu d’options d’une piste (bouton `⋯` ou menu contextuel), il est
possible de créer une playlist et d’y ajouter immédiatement cette piste, ou
de choisir une playlist existante. Le nom est nettoyé et limité à 60
caractères. Une playlist stocke son nom et les identifiants de ses pistes dans
MongoDB, avec l’identifiant de son propriétaire ; l’API permet ensuite de
lister les playlists du compte, d’ajouter ou retirer une piste et de supprimer
une playlist.

La page **Playlists** affiche les pistes enregistrées, permet de les lire
individuellement ou de lancer la sélection dans son ordre. Elle propose aussi
le retrait d’une piste, la suppression confirmée de la playlist et un état
explicite lorsqu’elle est vide.

![Playlist avec ses pistes et les actions de lecture, retrait et suppression](./preuves/fonctionnalites/playlists.png)

La **file d’attente** appartient au lecteur global de la session. Une piste
peut y être ajoutée depuis son menu, retirée individuellement ou supprimée de
la file entière. Les doublons et la piste déjà en cours sont écartés. À la fin
de la lecture, le lecteur retire la première piste de la file et la lance
automatiquement. Cette file est en mémoire dans le navigateur et n’est pas
conservée après fermeture ou rechargement.

### Lecteur audio enrichi

Le lecteur reste disponible en bas de l’interface pendant la navigation. Il
charge l’audio authentifié comme `Blob`, crée une URL locale pour l’élément
audio et révoque cette URL quand la piste change ou s’arrête. Les commandes
ajoutées sont :

- lecture/pause, déplacement dans le morceau et affichage du temps courant et
  de la durée ;
- réglage du volume, répétition de la piste et vitesse de lecture
  (`0,75×`, `1×`, `1,25×` ou `1,5×`) ;
- visualisation à la demande d’une forme d’onde : le lecteur décode le `Blob`,
  calcule 96 pics d’amplitude et place un repère à partir du rapport entre le
  temps courant et la durée ;
- lecture automatique de la piste suivante lorsqu’une file d’attente n’est
  pas vide.

Les erreurs de chargement, de décodage et les formats non pris en charge sont
signalés dans le lecteur au lieu d’être masqués.

### Profil, photo et confort d’utilisation

Le profil comprend une biographie (500 caractères maximum) et une photo
facultative. L’image doit être au format JPG, PNG ou WebP et ne pas dépasser
2 Mo. Le backend conserve les octets et le type MIME, permet de remplacer ou
supprimer la photo, et expose une route de lecture publique ; la photo peut
donc être affichée dans le menu de profil et sur les surfaces qui utilisent
cette route.

L’interface propose également un thème sombre ou clair, une navigation vers la
bibliothèque et les playlists, ainsi qu’une transition légère entre les pages.
Cette animation est désactivée si le navigateur signale une préférence pour
les mouvements réduits. Le thème sélectionné est appliqué à l’interface
courante, mais n’est pas mémorisé après un rechargement. La mise en page reste
adaptée aux petits écrans.

![Éditeur de photo de profil et règles de format et de taille](./preuves/fonctionnalites/profil-photo.png)

> **À propos des captures** : les captures TP déjà présentes illustrent les
> parcours vérifiés décrits plus haut. Les captures des filtres, playlists et
> photo de profil montrent l’interface actuelle avec des données de
> démonstration fournies par des réponses API simulées pour la capture ; elles
> ne contiennent pas de données personnelles et ne prouvent pas la persistance
> en base. Les échanges réels de l’API sont documentés séparément dans les
> rapports de vérification.

## Grille de conformité aux TP

| Consigne évaluée | Réalisation et vérification |
|---|---|
| **TP1 — Inscription, connexion, déconnexion et gestion des erreurs** | Parcours réussis et refusés observés ; voir [les preuves TP1](./preuves/tp1/verification.md). |
| **TP1 — Profil courant et modification du nom** | `GET`/`PUT /api/users/me`, session conservée après rechargement ; interface et Network ci-dessus. |
| **TP2 — Pagination réellement demandée à l'API** | `page` et `limit` transmis à chaque navigation ; aucune pagination locale de la liste complète. |
| **TP2 — Upload sécurisé et lisible** | Multipart avec `audio` et `title`, contrôles de format/taille, erreurs et succès documentés. |
| **TP2 — Lecture audio authentifiée** | Lecture via `Blob`/`ObjectURL`, avec contrôle du JWT et des réponses serveur. |
| **TP2 — Cards et adaptabilité mobile** | Métadonnées des pistes, commandes de lecture et vérification à 390 px. |
| **TP3 — Suppression et rafraîchissement** | Requête `DELETE` acceptée et `GET` de rafraîchissement capturés ; réserve de preuve visuelle indiquée ci-dessus et dans le rapport. |
| **TP3 — Progression d'upload** | Événements HTTP, pourcentage visible, prévention du double envoi et états d'erreur/réussite vérifiés. |
| **TP3 — Tests et build** | Résultats reproductibles listés dans la section [Vérifications](#vérifications). |

## Architecture

```text
Interface Angular
      │
      ▼
Services Angular ── HttpClient / intercepteur JWT
      │
      ▼
API Express ── Mongoose ── MongoDB
      │
      └── stockage et livraison des fichiers audio
```

Le frontend ne se connecte jamais directement à MongoDB. Les appels API et
leur authentification sont centralisés dans les services Angular ; les détails
des routes sont décrits dans [`API_CONTRACT.md`](./API_CONTRACT.md).

| Partie | Technologies |
|---|---|
| Frontend | Angular standalone, TypeScript, Signals, Reactive Forms, `HttpClient` |
| Backend | Node.js, Express, Mongoose, JWT, Multer |
| Données et fichiers | MongoDB Atlas et stockage audio géré par le backend |

## Lancer le projet

### Prérequis

- Node.js 22 ou plus récent et npm ;
- Git ;
- un compte MongoDB Atlas configuré selon [`ATLAS_SETUP.md`](./ATLAS_SETUP.md).

### 1. Configurer et démarrer l'API

Dans PowerShell :

```powershell
cd backend
Copy-Item .env.example .env
```

Renseigner localement `MONGODB_URI` et `JWT_SECRET` dans `backend/.env`, puis :

```powershell
npm install
npm start
```

L'API écoute par défaut sur `http://localhost:3000`. Ne jamais publier le
fichier `.env`, l'URI MongoDB ou le secret JWT.

### 2. Démarrer Angular

Dans un second terminal :

```powershell
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Le proxy du frontend transmet les appels `/api`
au backend local. Le compte de démonstration créé par le backend est
`demo@example.com` / `Demo1234!`.

## Vérifications

Les résultats consignés après exécution sont :

| Vérification | Résultat consigné |
|---|---|
| `npm test` dans `frontend-starter/` | **20 tests réussis** dans 2 fichiers. |
| `npm run build` dans `frontend-starter/` | **Build réussi**. |
| `npm test` dans `backend/` | **5 tests réussis**. |

Pour les relancer :

```powershell
cd frontend-starter
npm test
npm run build
```

Dans un autre terminal :

```powershell
cd backend
npm test
```

Les tests frontend utilisent des réponses HTTP simulées et ne nécessitent pas
un backend ou une base MongoDB actifs. Ils complètent les vérifications
manuelles décrites dans les rapports ; ils ne les remplacent pas.

## Documents et preuves détaillées

- [Sujet TP1](./SUJET_ETUDIANT_TP1.md) · [Sujet TP2](./SUJET_ETUDIANT_TP2.md) · [Sujet TP3](./SUJET_ETUDIANT_TP3.md)
- [Contrat de l'API](./API_CONTRACT.md) · [Configuration MongoDB Atlas](./ATLAS_SETUP.md)
- [Explications techniques du TP2](./TD2_EXPLICATIONS.md)
- [Rapport IA — modèle à compléter](./RAPPORT_IA_MODELE.md)
- [Vérifications et captures TP1](./preuves/tp1/verification.md)
- [Vérifications et captures TP2](./preuves/tp2/verification.md)
- [Vérifications et captures TP3](./preuves/tp3/verification.md)
- [Conseils d'utilisation d'un assistant IA](./CONSEILS_POUR_UTIISER_ASSISTANT_AI.md)

---

<div align="center">

**Salima Mazaev · Groupe de TD 2**

*Guitar Practice Cloud — importer, organiser et écouter ses backing tracks.*

</div>
