# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| POST | `/auth/logout` | JWT | `204` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| PUT | `/users/me/profile` | JWT, `{name,bio}` | `200 User` ; bio limitée à 500 caractères |
| PUT | `/users/me/avatar` | JWT, multipart `avatar` | `200 User` ; image JPEG, PNG ou WebP, 2 Mo max, stockée dans MongoDB |
| GET | `/users/me/avatar` | JWT | flux image privé ; `404` si aucune image |
| DELETE | `/users/me/avatar` | JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | JWT, multipart : `audio`, `title`, `bpm`, `key`, `waveform` | `201 Track` ; le tempo, la tonalité et les 128 amplitudes sont analysés dans le navigateur avant l’envoi |
| PUT | `/tracks/:id` | JWT, analyse calculée `{bpm,key,waveform}` | `200 Track` ; sert aussi à recalculer les anciens morceaux à leur première écoute |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT, piste appartenant à l'utilisateur | `204` ; supprime les métadonnées MongoDB et le fichier audio du disque |
| GET | `/playlists` | JWT | `200 Playlist[]` appartenant à l'utilisateur |
| POST | `/playlists` | JWT, `{name}` | `201 Playlist` |
| PUT | `/playlists/:id/tracks` | JWT, `{trackId,action}` (`add` ou `remove`) | `200 Playlist` |
| DELETE | `/playlists/:id` | JWT | `204` |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Un objet `Track` inclut les résultats d’analyse `bpm` (20–300 ou `null`), `key` (estimée ou vide) et `waveform` (128 amplitudes entre 0 et 1). Le navigateur analyse localement l’audio décodé avant son upload ; les octets audio ne sont pas envoyés à un service tiers pour cette analyse. Ces résultats sont des estimations et peuvent varier selon le contenu et l’encodage. Les anciens morceaux sans forme d’onde sont analysés et sauvegardés à leur première lecture. Formats audio acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum. Les filtres de format, date, BPM, tonalité, favoris et tri s'appliquent aux pistes de la page courante.

`User` inclut `bio` et `hasProfileImage`, sans exposer les octets de la photo ni le mot de passe. La photo est enregistrée comme donnée binaire et son type MIME dans le document utilisateur MongoDB. Une `Playlist` privée inclut `id`, `name`, `trackIds` et `createdAt`.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource ou piste absente/non autorisée, `409` email déjà utilisé. La suppression renvoie `500` si le serveur ne peut pas garantir l'effacement du fichier audio.

`POST /auth/logout` exige un JWT valide, sans corps de requête. Le serveur
enregistre son empreinte jusqu'à son expiration afin de refuser son utilisation
ultérieure. La réponse est `204` sans corps ; un JWT absent, invalide, expiré
ou déjà révoqué reçoit `401`.
