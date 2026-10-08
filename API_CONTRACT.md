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
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT, piste appartenant à l'utilisateur | `204` ; supprime les métadonnées MongoDB et le fichier audio du disque |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource ou piste absente/non autorisée, `409` email déjà utilisé. La suppression renvoie `500` si le serveur ne peut pas garantir l'effacement du fichier audio.

`POST /auth/logout` exige un JWT valide, sans corps de requête. Le serveur
enregistre son empreinte jusqu'à son expiration afin de refuser son utilisation
ultérieure. La réponse est `204` sans corps ; un JWT absent, invalide, expiré
ou déjà révoqué reçoit `401`.
