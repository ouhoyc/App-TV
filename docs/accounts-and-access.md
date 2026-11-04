# Comptes et accès SCDR TV

## État

Schéma appliqué au projet SCDR TV `woldrkevualjtdzsbcwn`, initialement vide.
Les règles ont été vérifiées dans une transaction annulée avec deux administrateurs
et deux revendeurs fictifs. Les comptes et invitations réels restent réservés aux
adresses explicitement choisies par les associés. La Crème Rose reste hors périmètre.

## Comportement attendu

| Opération                                | Administrateur                | Sous-revendeur      |
| ---------------------------------------- | ----------------------------- | ------------------- |
| Consulter les clients                    | Tous                          | Les siens           |
| Ajouter une fiche                        | Espace commun ou sous-revendeur | Pour lui uniquement |
| Modifier et renouveler                   | Tous                          | Les siens           |
| Attribuer un client                      | Oui                           | Non                 |
| Gérer les sous-revendeurs et leurs rôles | Oui                           | Non                 |
| Supprimer définitivement                 | Oui, avec confirmation        | Non                 |

Le nom du sous-revendeur et un filtre « Tous les revendeurs » apparaissent pour
l’administrateur. Un sous-revendeur n’a pas accès à la liste des autres revendeurs.
Les compteurs, recherches et exports sont calculés sur les seules fiches autorisées.

### Espace commun des deux associés

Les deux associés disposent de deux accès administrateurs au même espace. Le filtre
par défaut est « Notre clientèle » : il regroupe leurs anciennes fiches, sans
exposer deux clientèles d’administrateurs distinctes dans le menu. Les nouveaux
clients communs et les paramètres des deux panels sont enregistrés dans le coffre
du premier administrateur créé (identifiant stable, identique pour les deux
sessions). Les anciens coffres restent lus, leurs fiches ne sont ni supprimées
ni réattribuées automatiquement. Les deux clés administrateurs restent
destinataires de tout enregistrement. Les révisions empêchent l’écrasement d’une
modification concurrente. Les sous-revendeurs gardent des coffres séparés ; un
administrateur peut filtrer leur clientèle ou afficher toutes les clientèles.

## Autorisation dans Postgres

- Profils liés aux identifiants Supabase Auth, avec rôle `admin` ou `reseller` et
  état d’activation. Aucun droit d’inscription libre donnant automatiquement un rôle
  administrateur. Le premier administrateur est attribué à un compte explicitement
  identifié, via une opération privilégiée.
- Rôles conservés dans une table protégée. Ne jamais utiliser `user_metadata` pour
  décider des autorisations : l’utilisateur peut modifier ces données.
- Chaque clientèle est enregistrée dans `app_tv_vaults` avec un `owner_id` non nul
  et unique qui référence son propriétaire. Les fiches gardent leurs identifiants
  dans le contenu chiffré. Les mises à jour utilisent une révision attendue pour
  refuser les modifications concurrentes périmées.
- Toutes les tables exposées à l’API activent RLS et accordent explicitement les
  privilèges nécessaires au rôle `authenticated`. Aucun accès pour `anon`.
- Lecture et modification autorisées seulement pour le propriétaire actif ou un
  administrateur actif. Une suspension est vérifiée en base, sans attendre le
  renouvellement du JWT.
- Les règles UPDATE vérifient à la fois l’ancienne ligne (`USING`) et la nouvelle
  (`WITH CHECK`). Un sous-revendeur ne peut jamais modifier `owner_id` ou son rôle.
- Les abonnements et historiques sont inclus dans le coffre chiffré du propriétaire.
  Il n’existe pas de table enfant exposée séparément.
- Réserver l’invitation et les changements de rôle à un endpoint administrateur
  authentifié. Les clés `service_role` ne sont jamais intégrées au navigateur.
- Les changements de propriétaire et de droits sont audités. Une fonction
  privilégiée éventuelle est minimale, dans un schéma non exposé, avec un
  `search_path` fixé et des droits EXECUTE explicitement restreints.

## Confidentialité et récupération

### Déverrouillage biométrique sur un appareil

Le lien `/api/update` contourne les anciennes versions du service worker, met
à jour le shell et ouvre `/?setup=face-id`. Après connexion, l’activation s’ouvre
directement si elle manque. Ce parcours conserve localStorage et IndexedDB.
Les nouvelles navigations cherchent la version réseau, avec secours hors ligne.
Le worker s’active sans attendre la fermeture des anciens onglets, mais ne les
recharge pas et conserve leurs caches statiques pour préserver le travail en cours.
`tests/update-browser.mjs` reproduit le worker historique, vérifie sa mise à jour
avec un ancien onglet ouvert et contrôle la conservation des deux stockages.

Après connexion, « Activer Face ID » demande le mot de passe une fois puis crée
une clé d’accès de plateforme avec vérification utilisateur obligatoire. WebAuthn
PRF fournit une clé AES-GCM qui protège une copie locale de la clé privée et
le dérivé d’authentification du mot de passe. Ce dérivé est un secret équivalent
à un mot de passe pour l’API : il reste dans l’enveloppe chiffrée et n’est récupéré
qu’après vérification utilisateur par WebAuthn. L’enveloppe est liée au compte,
à l’origine et à la clé d’accès. Aucun mot de passe original ni résultat PRF
n’est stocké. L’adresse du compte est mémorisée pour le bouton de reconnexion.
Face ID, Touch ID ou le code de l’appareil sont choisis par le système.

L’activation affiche des étapes distinctes : vérification du mot de passe,
clic direct « Créer ma clé d’accès », puis clic direct « Terminer avec Face ID »
si PRF n’est pas évalué à la création. Cela évite de perdre le geste utilisateur
pendant PBKDF2 ou entre deux cérémonies WebAuthn. Le workspace est verrouillé
avant d’afficher l’activation ; l’ouverture du gestionnaire de mots de passe
n’interrompt donc pas le formulaire. Le matériel de préparation en mémoire est
effacé à la fermeture, après deux minutes ou lors d’un passage en arrière-plan
hors cérémonie Apple. Le succès n’est annoncé qu’après relecture du stockage.

Au démarrage, et au retour au premier plan si le coffre a été verrouillé après
cinq minutes en arrière-plan, une clé déjà enregistrée déclenche une tentative
automatique unique. Un retour avant cinq minutes conserve le coffre et la page
ouverts ; aucune inactivité au premier plan ne le verrouille. Une annulation laisse le bouton et le mot de
passe disponibles sans boucle. Une déconnexion explicite attend la prochaine
ouverture ; un verrouillage manuel reste verrouillé. Le contrôle initial d’une
session absente ne déclenche pas le signal d’expiration réservé aux requêtes
authentifiées, car celui-ci annulait la tentative de reconnexion.

La connexion Face ID soumet le dérivé déchiffré à l’endpoint de connexion habituel,
qui crée une nouvelle session HttpOnly et contrôle que le compte est actif.
Le chargement des données requiert toujours une session valide et les droits
actuels du compte. L’activation est propre
à ce navigateur ; une suppression des données du site demande une réactivation.
La déconnexion révoque la session mais conserve l’enveloppe locale. Les boutons
« Désactiver sur cet appareil » et « Oublier ce compte sur cet appareil » la suppriment
(la clé d’accès peut rester dans le gestionnaire système). Les enveloppes v1
permettent encore le déverrouillage d’une session ; une activation avec le mot de
passe les met à jour en v2 en réutilisant la clé d’accès. Un changement du mot de
passe demande une réactivation. Sans PRF, aucune
enveloppe n’est enregistrée et le mot de passe reste disponible. Safari 18+ prend
en charge PRF, sous réserve du fournisseur de clés utilisé.

`tests/device-unlock-browser.mjs` vérifie la vraie API WebAuthn avec un
authentificateur virtuel Chromium : activation, déchiffrement d’une fiche,
déconnexion/rechargement/reconnexion automatique via l’API, ouverture du gestionnaire
de mots de passe, appels natifs par clic direct, annulation avec secours par mot de
passe, intégrité, désactivation/oubli, connexion refusée et absence de PRF.
Ces tests ne valident pas le matériel Face ID
d’un iPhone réel.

L’autorisation RLS et le chiffrement sont deux protections distinctes. Préserver le
coffre local existant jusqu’à confirmation de la migration et de sa relecture.

Pour conserver le chiffrement de bout en bout annoncé, les fiches doivent être
chiffrées sur l’appareil. Les clés doivent permettre une lecture par le propriétaire
et l’administrateur, sans donner accès aux autres revendeurs. Les clés privées sont
protégées ; le serveur ne conserve pas de clé de déchiffrement en clair. Une simple
réinitialisation du mot de passe Auth ne doit pas contourner cette protection.
Prévoir une récupération explicite des clés et ne pas présenter la récupération
du compte comme une récupération automatique des données chiffrées.

## Vérification avant activation

Effectuer les tests avec des comptes et données fictifs sur le projet SCDR TV :

1. Un utilisateur non connecté ne lit ni profils ni fiches.
2. Le revendeur A peut créer, lire, modifier et renouveler ses fiches.
3. Le revendeur A ne peut ni lire ni modifier une fiche de B, même par son ID.
4. A ne peut ni créer une fiche au nom de B, ni changer de propriétaire, ni
   devenir administrateur en modifiant son profil ou ses métadonnées Auth.
5. L’administrateur voit les fiches de A et B et peut gérer leurs attributions.
6. Un compte suspendu perd immédiatement l’accès aux données côté serveur.
7. Les clés de A ne déchiffrent pas les fiches de B ; les clés de l’administrateur
   déchiffrent les fiches autorisées de A et B.
8. Une erreur réseau n’est jamais affichée comme une sauvegarde réussie. Les
   changements non synchronisés restent signalés et récupérables.
9. La déconnexion retire les données déchiffrées de l’interface ; un autre compte
   sur le même appareil ne reçoit pas les données du précédent.
10. Les fiches migrées sont relues après déconnexion/reconnexion et depuis un
    deuxième appareil avant de considérer la synchronisation opérationnelle.

## Limite des droits sur un coffre chiffré

La frontière imposée par le serveur est celle du coffre propriétaire : un revendeur
ne peut lire ni remplacer celui d’un autre. Le contenu du coffre est opaque pour le
serveur ; celui-ci ne peut pas distinguer une modification d’une suppression de
fiche à l’intérieur de son propre coffre. L’interface réserve la suppression
définitive aux administrateurs, mais cela ne constitue pas une restriction
cryptographique sur le contenu qu’un propriétaire autorisé peut réécrire.
