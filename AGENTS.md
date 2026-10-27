# Consignes pour travailler avec moi

Ce fichier décrit comment je travaille. Il vient de mon expérience avec deux applis :
- **« Dépenses »** : appli web privée pour iPhone, données chiffrées qui ne quittent jamais le téléphone ;
- **« La Crème Rose »** : appli web pour iPhone, données partagées entre deux personnes (ma femme et moi) et synchronisées en direct.

Lis-le en entier avant de commencer, et respecte-le pendant tout le projet.

**Le nouveau projet** : une appli où je partage des **données confidentielles avec un collègue**. La mise en page, c'est toi qui la fais. Ce qui compte pour moi : que ce soit simple, fiable, et que **personne d'autre que nous deux** ne puisse lire les données.

---

## 1. Qui je suis, comment me parler

- Je ne suis pas développeur. Explique tout simplement, **toujours en français**, sans jargon. Ne passe jamais à l'anglais. Si un terme technique est inévitable, explique-le en une phrase.
- Messages courts et clairs : ce que tu as fait, ce que je dois faire (étapes numérotées), ce qu'il reste à décider. Pas de pavé technique.
- Quand tu me poses des questions, numérote-les et propose une réponse recommandée. Je réponds souvent en style télégraphique (« 1A, 2 oui, 3 go »).
- Quand je demande des idées : une liste numérotée courte, regroupée par thème, avec pour chacune ce qu'elle m'apporte concrètement. Termine par ta recommandation (2 ou 3 idées et pourquoi).
- J'écris souvent vite ou en dictée vocale : il peut y avoir des fautes ou des phrases en vrac. Cherche ce que je veux dire. Si c'est ambigu, dis-moi comment tu as compris avant de te lancer.
- J'envoie souvent des captures d'écran de mon iPhone pour montrer un problème.

## 2. Règles de travail (non négociables)

1. **Ne rien coder sans mon feu vert explicite** (« vas-y », « go », « ok »). D'abord tu proposes : ce que je verrai à l'écran, ce qui se passe quand j'appuie, un exemple concret, les choix, les risques et les limites. J'approuve, ensuite tu codes. Quand je dis « ne code rien », je veux seulement une réponse ou des conseils.
2. **Exception** : un petit ajustement clair (un texte, un bouton qui ne marche pas, un bug que je signale) peut être corrigé directement, sans demander.
3. **Changement visible** : montre une maquette (capture d'écran) avant si c'est utile. Si j'hésite, fais plusieurs variantes côte à côte (actuelle / A / B), en mode clair et sombre, et attends mon choix.
4. Si une exigence est **impossible ou risquée** (sur iOS, côté sécurité, côté confidentialité), dis-le clairement. Ne la contourne jamais en douce, ne la remplace pas par autre chose sans me prévenir.
5. Chaque **bibliothèque ou ressource externe** (librairie, police, CDN, service, API) doit être justifiée et validée par moi avant d'être ajoutée. Par défaut : zéro dépendance. Si une librairie est validée, elle est copiée dans le projet (pas chargée depuis Internet).
6. **Vérifie l'état réel avant d'affirmer quelque chose** (GitHub, une PR, un déploiement, un test, une base de données). Ne dis jamais « c'est fait », « c'est fusionné » ou « ça marche » sans l'avoir vérifié. Si tu ne sais pas, dis-le. Quand je te dis que j'ai fait une manip, vérifie de ton côté qu'elle a marché.
7. **Teste avant de me livrer**, dans un vrai navigateur qui simule un iPhone, en mode clair et en mode sombre. Relance aussi les anciens tests pour vérifier que rien n'est cassé. Dis-moi honnêtement ce qui a été testé et ce qui ne l'a pas été (par exemple « à vérifier sur ton vrai iPhone »). Si un test échoue, dis-le.
8. Rappelle-moi de garder la **double authentification (2FA) GitHub** active quand je dois valider quelque chose sur GitHub.
9. **Aucune action irréversible** (suppression de données, de dépôt, réécriture d'historique, publication) sans m'avoir demandé.
10. **Aucune information personnelle** (prénoms, données réelles) dans le code ni dans les tests : le dépôt peut être public. Utilise des données inventées.

### Quand j'ai une manip à faire moi-même
Par exemple régler quelque chose sur un site ou coller du code dans une console :
- donne des **étapes numérotées très précises**, en partant de là où je suis (« Va sur … → ouvre … → menu de gauche → … ») ;
- précise si je suis sur **téléphone ou ordinateur**, car les menus ne sont pas au même endroit ;
- donne le code **en entier dans un seul bloc** à copier, sans aucun secret dedans ;
- dis exactement **ce que je dois voir** si ça a marché, et quoi faire si un message d'erreur apparaît ;
- si tu peux faire la manip toi-même avec tes outils, fais-la plutôt que de me la demander.

## 3. Organisation du code et des versions

- Une branche de travail. Chaque version passe par une **Pull Request vers `main`, que je fusionne moi-même**. `main` est protégée, et tu ne fusionnes jamais à ma place.
- Un **numéro de version** à chaque livraison (1.0.0, 1.1.0…), affiché dans l'appli (Réglages). S'il y a un service worker, le numéro doit être changé aussi dans `sw.js`, sinon le téléphone ne voit pas la mise à jour.
- Un **cahier des charges** (`CAHIER_DES_CHARGES.md`) tenu à jour : chaque version y ajoute une section « ce qui a changé et pourquoi », plus une liste « pistes pour plus tard » (mes idées non décidées).
- Après chaque PR : explique-moi en français ce qui change pour moi et comment installer la mise à jour.

## 4. Mes exigences de sécurité et de confidentialité (style « Dépenses »)

Pour « Dépenses », la règle était : les données ne quittent jamais le téléphone. Concrètement :

- **Zéro ressource chargée depuis Internet** : pas de CDN, pas de Google Fonts (police système), pas d'analytics, pas de pub, pas de tracker.
- **Tout est chiffré**, y compris les dates. Seul un identifiant aléatoire reste en clair.
- **Rien de sensible** dans localStorage, sessionStorage, les cookies ou le cache du service worker.
- **Content Security Policy stricte** : pas de script ni de style inline, pas d'`eval`, pas d'`innerHTML`.
- **Déverrouillage** par passkey / Face ID, plus une phrase de secours de 12 mots notée sur papier. Verrouillage automatique après inactivité.
- **Sauvegardes** exportées chiffrées. Export en clair seulement à ma demande, et en le signalant.
- Les **identifiants techniques** (adresse du site, nom de la base, étiquettes de chiffrement) ne changent jamais une fois en production, sinon les données deviennent illisibles.

## 5. Ce que « La Crème Rose » m'a appris sur le partage à deux

Pour La Crème Rose, les données étaient partagées entre deux téléphones, mais **pas chiffrées de bout en bout** : ce n'était pas nécessaire pour des commandes de gâteaux. Ce qui a bien marché et que j'aime retrouver :

- **Appli web installée sur l'écran d'accueil de l'iPhone** (« Ajouter à l'écran d'accueil » dans Safari) : elle s'ouvre en plein écran sans les barres de Safari, comme une vraie appli. HTML, CSS et JavaScript simples, sans framework.
- **Bandeau « Nouvelle version disponible — Mettre à jour »** : l'appli ne se met jamais à jour toute seule pendant qu'on s'en sert.
- **Comptes fermés** : connexion par e-mail et mot de passe, inscriptions désactivées, et une **liste blanche** des deux personnes autorisées, vérifiée par la base de données elle-même (règles ligne par ligne, « RLS », sur chaque table et sur le stockage de fichiers).
- **Synchronisation en direct** entre les deux téléphones, avec un rechargement de secours au retour sur l'appli.
- **Hors ligne d'abord** : on peut travailler sans réseau, les changements partent tout seuls au retour de la connexion. Seuls les champs modifiés sont envoyés, pour que deux personnes qui changent des choses différentes en même temps ne s'écrasent pas. Un indicateur montre l'état (« Synchronisé », « Hors ligne »).
- **Hébergement** : Supabase pour la base et les comptes, Vercel pour le site et les tâches automatiques, à partir du dépôt GitHub. Les secrets sont dans les variables d'environnement de Vercel, jamais dans le code.
- **Notifications** sur iPhone (Web Push, possible parce que l'appli est installée sur l'écran d'accueil), avec un bouton « Tester la notification ». Elles demandent un serveur, et une tâche programmée chaque matin.
- **Confort sur iPhone** : gros boutons, glisser pour supprimer avec « Annuler », glisser vers la droite pour revenir en arrière comme sur iPhone, curseur placé directement dans la première case, touche « Suivant » sur le clavier, recherche, pastille sur l'icône.
- **Tests** dans un iPhone simulé (Playwright) avec un **faux serveur**, pour ne jamais toucher aux vraies données : parcours complets, deux téléphones en même temps, coupure de réseau, ouverture sans réseau, petit écran, mode sombre.

⚠️ Pour le nouveau projet, ce modèle ne suffit pas tel quel : le serveur pourrait lire les données. Il faut y ajouter le chiffrement de bout en bout (section 6).

## 6. Le nouveau projet : partage chiffré avec un collègue

Ici, les données confidentielles doivent être partagées avec un collègue. Le principe « rien ne quitte le téléphone » ne peut donc pas s'appliquer tel quel. **Avant de coder quoi que ce soit, tu dois m'expliquer simplement les options et leurs risques, et me laisser choisir.** Mes attentes :

- **Chiffrement de bout en bout** : les données sont chiffrées sur nos appareils. Tout serveur ou service qui les transporte ne voit que du contenu illisible. Personne d'autre que mon collègue et moi ne doit pouvoir les lire : ni l'hébergeur, ni toi, ni un tiers.
- **Le moins de services tiers possible.** Pour chaque service proposé (hébergement, synchronisation, base de données), dis-moi qui il est, ce qu'il voit, et ce qui se passe s'il est piraté.
- **Échange des clés** entre mon collègue et moi : propose une méthode simple et sûre (par exemple en personne, avec un QR code). Explique ce qui se passe si l'un de nous perd son appareil ou quitte le projet.
- **Dis-moi clairement ce qui est impossible ou risqué**. Par exemple : synchronisation en temps réel sans serveur, révocation d'un accès déjà donné, récupération si les deux clés sont perdues.
- **Obligations professionnelles** : signale-moi si quelque chose demande l'accord de mon employeur ou pose un problème légal (RGPD, données de clients).
- **Rien de partagé par défaut** : chaque partage doit être volontaire et visible.
- **Même si les données sont chiffrées**, garde les protections de La Crème Rose : comptes fermés, liste blanche, règles d'accès sur chaque table. Aucune table ni aucun fichier public.
- **Notifications** : leur texte s'affiche sur l'écran verrouillé et passe par les serveurs d'Apple. Il ne doit donc contenir **aucune donnée confidentielle** (« Nouvel élément partagé », pas le contenu).
- **Rien de confidentiel** dans les journaux (logs) du serveur ni dans les messages d'erreur.
- **Avant la mise en ligne**, vérifie toi-même et montre-moi :
  - qu'une personne non connectée, ou connectée avec un compte non autorisé, ne voit rien ;
  - que ce qui est stocké sur le serveur est bien illisible.

## 7. Limites iOS déjà rencontrées (si c'est une appli web pour iPhone)

- Face ID demande un geste de l'utilisateur. Un déclenchement automatique affiche une feuille de confirmation iOS (inévitable).
- Safari et l'appli ajoutée à l'écran d'accueil n'ont pas les mêmes données.
- Le nom et l'icône sont figés au moment de l'ajout à l'écran d'accueil.
- Pas de tâche en arrière-plan, pas de notification fiable sans serveur.
- Les notifications ne marchent que depuis l'appli installée sur l'écran d'accueil, après autorisation. Elles ne s'affichent pas si l'appli est ouverte au premier plan : pour tester, il faut verrouiller le téléphone.
- Le clavier ne s'ouvre tout seul que si la case est activée pendant l'appui de l'utilisateur.
- Les mises à jour s'appliquent quand l'appli est fermée : prévoir un bandeau « mise à jour disponible ».

## 8. En résumé

1. Français, mots simples, réponses courtes, questions numérotées avec une réponse recommandée.
2. Tu proposes → je valide → tu codes. Les petits ajustements clairs peuvent être faits directement.
3. Zéro dépendance externe sans mon accord. Rien d'irréversible sans mon accord.
4. Tu testes vraiment, tu vérifies l'état réel, tu dis honnêtement ce qui est testé ou non.
5. PR vers `main` que je fusionne moi-même, numéro de version, cahier des charges à jour.
6. Confidentialité : chiffrement de bout en bout, personne d'autre que nous deux, jamais de secret ni de donnée réelle dans le code.
