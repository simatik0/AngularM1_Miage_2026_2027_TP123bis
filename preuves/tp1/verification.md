# Vérifications TP1 — 7 octobre 2026

Frontend de cette branche servi sur http://localhost:4201, proxy vers le backend
déjà démarré sur http://localhost:3000. Requêtes observées avec Playwright dans
le navigateur, sans simulation HTTP. La configuration de la base du backend
existant n'a pas été inspectée : son hébergement Atlas n'est pas certifié.

## Résultats reproductibles

| Action | Méthode et chemin | Statut observé | Résultat |
|---|---|---|---|
| Connexion du compte de démonstration | POST /api/auth/login | 200 | Redirection /tracks |
| Mot de passe incorrect | POST /api/auth/login | 401 | Message « Identifiants incorrects », sans Authorization |
| Inscription d'un compte de test | POST /api/auth/register | 201 | Redirection /profile |
| Actualisation du profil | GET /api/users/me | 200 | Profil retourné, Authorization présent |
| Modification du nom | PUT /api/users/me | 200 | Nom et en-tête actualisés, Authorization présent |
| Rechargement du navigateur | /profile | — | Session conservée et nom modifié rechargé |
| Déconnexion | POST /api/auth/logout | 204 | Jeton local supprimé, retour /login |
| Jeton volontairement invalide | GET /api/users/me | 401 | Jeton supprimé, redirection /login |

Les URL des requêtes commencent par `http://localhost:4201/api/`.
Connexion : corps `{ "email": "demo@example.com", "password": "[masqué]" }`.
Échec de connexion : réponse `{ "message": "Identifiants incorrects" }`.
Lecture du profil : aucun corps de requête.
Modification : corps `{ "name": "Verification TD1 modifie" }`.
Réponse de profil observée :

```json
{
  "id": "6ac6a5c78e9cebbf8f97f530",
  "name": "Verification TD1 modifie",
  "email": "td1-check-20261007-2205@example.com",
  "createdAt": "2026-10-07T20:04:23.217Z"
}
```

Le compte de test a été créé pour cette vérification et reste dans la base.
Le nom du compte de démonstration n'a pas été modifié.

## Vérifications automatisées

- `npm run build` dans le frontend : succès.
- `npm test` dans le frontend : 6 tests réussis (API simulée).
- `npm test` dans le backend : 3 tests réussis ; ils ne certifient pas Atlas.

## Preuve visuelle et limite

[Profil après modification et rechargement](./profil-interface.png).

Cette capture montre l'interface réelle. Ce document consigne les observations
HTTP réelles, mais ne remplace pas la capture de l'onglet Network demandée par
le sujet. Celle-ci reste à ajouter en masquant mot de passe et JWT.
