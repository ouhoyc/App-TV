# Privé — App-TV

Panel personnel de clients et d’abonnements, en français, pour iPhone. React, TypeScript et Vite ; aucun serveur de données, compte externe, outil de suivi ou diffusion de flux.

## Démarrer

Prérequis : Node.js 22.12+ ou 24 et npm.

```sh
cd /workspace/App-TV
npm ci
npm run dev
```

Pour un hébergement réel, exécuter `npm run build` et servir **le contenu de `dist/` à la racine d’un site HTTPS dédié**. Ne pas exposer le serveur Vite de développement sur Internet. Les données de chaque origine (protocole, domaine et port) sont distinctes : exporter avant de changer de domaine. Ne pas partager l’origine avec une application non fiable.

Pour vérifier la version de production en local :

```sh
npm run build
npm run preview
```

Le service worker est activé en production seulement. Il conserve uniquement les fichiers statiques ; aucune donnée client n’entre dans Cache Storage. Après le premier chargement complet, attendre son installation avant de couper le réseau. Les mises à jour s’activent après fermeture des anciens onglets.

## Sur iPhone

1. Ouvrir l’application hébergée en HTTPS dans Safari.
2. Créer un mot de passe maître d’au moins 12 caractères et le conserver en lieu sûr.
3. Menu Partager → Sur l’écran d’accueil.
4. Ajouter une fiche et exporter immédiatement une sauvegarde depuis Paramètres.

**Le stockage Safari n’est pas une sauvegarde.** iOS peut supprimer des données locales. Effacer les données du site, supprimer l’application, perdre ou casser le téléphone peut entraîner une perte. Conserver des exports chiffrés sur un autre appareil ou support. Une demande de stockage persistant est effectuée, sans garantie d’acceptation. Éviter la navigation privée. Safari et la PWA installée peuvent présenter des espaces de stockage différents : vérifier les données et utiliser l’export/restauration pour les transférer.

## Utilisation

- Tableau de bord : clients non archivés, abonnements actifs, expirés, sous 7 et sous 30 jours. Le jour d’expiration est inclus dans la validité ; les statuts sont recalculés chaque minute.
- Clients : recherche par nom (sans accents), téléphone, fournisseur ou identifiant ; plusieurs abonnements, modification, archivage, suppression confirmée. Les archives ne comptent pas dans le tableau de bord mais sont sauvegardées.
- Abonnement : les informations de connexion sont masquées et peuvent être révélées ou copiées individuellement. Les liens ne sont jamais ouverts automatiquement.
- Renouvellement : nouvelle échéance et historique local. Aucun achat ni renouvellement n’est effectué chez un fournisseur. Un statut suspendu reste suspendu.
- Partage : message modifiable, avertissement et confirmation de confidentialité avant ouverture du partage natif, de WhatsApp ou de SMS. L’envoi final est manuel. WhatsApp reçoit le texte lors de son ouverture ; le presse-papiers et les applications destinataires sortent du périmètre du coffre.
- Sauvegarde : un mot de passe de sauvegarde indépendant protège l’ensemble des clients, abonnements, identifiants, historiques et paramètres fournisseur. Aucun export en clair n’est proposé. Vérifier que le fichier a effectivement été conservé : la date affichée indique un export lancé, pas une copie externe garantie.
- Restauration : vérification cryptographique avant aperçu, puis confirmation. Les doublons sont identifiés par ID, téléphone normalisé ou nom exact. Choisir de conserver les fiches existantes (défaut) ou de remplacer intégralement les correspondantes. Les correspondances ambiguës sont refusées. Les paramètres fournisseur actuels restent conservés, comme indiqué dans l’aperçu. Sur un nouvel appareil, créer un coffre puis restaurer le fichier avec son mot de passe de sauvegarde.
- CSV : séparateurs virgule ou point-virgule, UTF-8, champs entre guillemets ; association des colonnes, aperçu sans identifiants visibles, erreurs par ligne et confirmation. Les dates utilisent AAAA-MM-JJ. Un abonnement importé nécessite une expiration ; le début est aujourd’hui s’il n’est pas renseigné. Corriger toutes les erreurs avant import. Les doublons sont ignorés. Le fichier et ses données ne sont pas persistés en clair par l’application.

## Sécurité

Le coffre complet est chiffré avant toute écriture IndexedDB : PBKDF2-SHA-256, 600 000 itérations, sel aléatoire de 128 bits, AES-256-GCM, IV neuf de 96 bits à chaque écriture et données additionnelles authentifiées versionnées. Chaque sauvegarde utilise un nouveau sel et son propre mot de passe. Les paramètres importés sont bornés et les structures validées avant modification. La clé Web Crypto est non exportable, conservée uniquement en mémoire ; le mot de passe maître n’est jamais enregistré. Aucun secret dans localStorage, les URL de l’application ou les journaux.

Chaque écriture est une transaction atomique. Un contrôle de version refuse les sauvegardes périmées venant d’un second onglet. Une erreur de stockage ne remplace pas l’état affiché comme enregistré. Le coffre se verrouille après 5 minutes sans interaction, y compris le temps passé dans une autre application. Un bref changement de fenêtre conserve le déverrouillage et le formulaire en cours. Au retour, le délai est vérifié même si iOS a suspendu les minuteries. Une fermeture ou un rechargement complet demande toujours le mot de passe. Les modifications de formulaire non enregistrées sont alors abandonnées. Le mot de passe n’a aucune procédure de récupération : une sauvegarde et son propre mot de passe permettent de restaurer dans un nouveau coffre.

Le chiffrement protège le stockage au repos. Il ne protège pas d’un appareil compromis, d’un script malveillant sur la même origine, d’une extension intrusive, d’un mot de passe devinable ni d’un partage volontaire. Aucun audit de sécurité indépendant n’a été réalisé. Aucun Face ID n’est simulé.

## Strong 8K : volontairement en attente

`src/provider.ts` isole le contrat d’un adaptateur en lecture. L’écran de configuration stocke l’adresse HTTPS et la clé dans le coffre. **Aucun appel fournisseur n’est encore implémenté**, même pour tester la connexion : il manque la documentation 1.81. Les erreurs d’authentification/suspension et les consultations réelles seront implémentées à partir du protocole documenté, après vérification CORS/HTTPS et du mode de transport de la clé. Aucune récupération de liste complète des clients n’est promise. Les écritures distantes sont désactivées. Si un intermédiaire serveur s’avère nécessaire, cela devra être expliqué avant changement d’architecture.

## Vérifications

```sh
npm test
npm run build
# Dans un terminal séparé : npm run preview
# Installer Chromium si aucun navigateur n’est présent : npx playwright install chromium
npm run test:browser
npm run test:locking
```

`CHROMIUM_PATH` peut sélectionner un navigateur système. Le parcours navigateur crée uniquement des données de test dans un profil temporaire et produit ses captures dans `/tmp`. Il couvre le stockage chiffré, le rechargement/déverrouillage, les champs masqués, le renouvellement, l’export/restauration, le format mobile et le rechargement hors ligne. Les tests unitaires couvrent chiffrement, intégrité, mauvais mots de passe, CSV, doublons, dates, renouvellements et écritures concurrentes.

Validé dans cet environnement : compilation TypeScript/Vite, tests unitaires et Chromium. **Safari iOS réel, installation sur écran d’accueil, partage natif et comportement de purge iOS restent à vérifier sur iPhone.** Aucun hébergement, publication de l’environnement ou envoi vers GitHub n’est réalisé par ces commandes.

Architecture : `model.ts` règles métier, `crypto.ts` coffre/sauvegardes, `storage.ts` IndexedDB, `csv.ts` import, `provider.ts` intégration isolée, `App.tsx` interface. Le dépôt initial est vide ; aucune donnée de démonstration n’est ajoutée dans le coffre réel.
