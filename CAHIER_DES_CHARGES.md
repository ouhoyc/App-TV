# App-TV — cahier des charges

## Usage actuel

Application personnelle pour iPhone : clients et abonnements, coffre local chiffré,
sauvegarde/restauration chiffrée, import CSV et utilisation hors ligne.
Les essais utilisent des données fictives. Aucun partage entre comptes n'est implémenté.

## Version 0.1.1 — changement de fenêtre

### Ce qui a changé et pourquoi

- Un changement de fenêtre ne verrouille plus immédiatement le coffre, afin de
  consulter une autre application et revenir au formulaire en cours.
- Le verrouillage reste automatique après cinq minutes sans interaction, temps
  passé en arrière-plan inclus. Le délai est vérifié au retour même si les
  minuteries ont été suspendues par le téléphone.
- Le verrouillage manuel, le chiffrement et le verrouillage après rechargement
  sont conservés. Si iOS ferme la page, le formulaire non enregistré est perdu.
- La version est affichée dans Paramètres et incluse dans le cache hors ligne.

### Mise à jour

Après validation de la Pull Request et publication : ouvrir l'application avec
Internet pour télécharger la mise à jour, fermer ses fenêtres puis la rouvrir.
Vérifier « Version 0.1.1 » dans Paramètres. Ne pas effacer les données Safari.

## Pistes pour plus tard — non décidées

- Ajuster les écrans après essai de deux clients fictifs.
- Définir le partage volontaire avec un collègue et le chiffrement de bout en bout
  avant toute mise en place d'un serveur de synchronisation.
