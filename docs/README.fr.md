# TRAE-Ollama-Bridge
<picture>
    <img src="../img/Traellama-Hero.png" alt="Traellama-Hero">
</picture>

Mis à jour : 2025-11-05 • Version : dernière

> Utilisez des modèles Ollama locaux dans des IDE qui imposent les endpoints OpenAI (comme TRAE). Ce pont encapsule Ollama via une API compatible OpenAI et fournit une interface Web pour gérer les mappages de modèles, tester des chats et, facultativement, intercepter `https://api.openai.com` de manière transparente.

## Présentation
Exposez Ollama local via une interface compatible OpenAI pour contourner les restrictions de fournisseur et de Base URL dans TRAE et des IDE similaires. L’interface Web gère les mappages et propose un testeur de chat. Une politique d’interception au niveau système peut prendre en charge les clients qui appellent toujours `https://api.openai.com`.

## Points forts
- Endpoints `/v1` compatibles OpenAI : plug-and-play avec TRAE et IDEs similaires.
- Test de chat bimode : basculez en un clic entre "Explicit Bridge" et "Transparent Interception".
- Validation optionnelle de la clé API : respecte `EXPECTED_API_KEY` et `ACCEPT_ANY_API_KEY`.
- Politique système en un clic : installer/réutiliser le CA local et le certificat de domaine, écrire `hosts`, configurer le 443→port local.
- Gestion des mappages : mapper les modèles Ollama en IDs de style OpenAI pour une sélection aisée dans les IDEs.
- Réponses en streaming ou non : simule le comportement de Chat Completions d’OpenAI.
- Priorité locale & confidentialité : le trafic reste sur votre machine.

## Remarques
1. Installez Ollama et assurez-vous que les modèles requis fonctionnent correctement. Augmentez si nécessaire la longueur de contexte.
2. Copiez `.env.example` en `.env` et adaptez les variables à votre environnement.
3. Démarrez ce projet avant de configurer le modèle personnalisé dans Trae IDE.

## Variables d’environnement
Voir `.env.example` :
- `PORT` (par défaut `3000`)
- `HTTPS_ENABLED=true|false` (par défaut `false`)
- `SSL_CERT_FILE`, `SSL_KEY_FILE` (nécessaires si HTTPS est activé)
- `OLLAMA_BASE_URL` (par défaut `http://127.0.0.1:11434`)
- `EXPECTED_API_KEY` (clé fixe, optionnelle)
- `ACCEPT_ANY_API_KEY=true|false` (par défaut `true`)
- `STRIP_THINK_TAGS=true|false` (supprime `<think>...</think>`)
- `ELEVATOR_PORT` (par défaut `55055`)

## Démarrage rapide (Windows)
0. Installez Node.js (v18+ recommandé) et npm.
1. Double-cliquez sur `Start-Bridge.bat` pour lancer (la première exécution installe automatiquement les dépendances).
2. Le navigateur ouvre `http://localhost:PORT/` (par défaut `PORT=3000`) et affiche l’interface Web UI.
3. Service de pont privilégié via la Web UI :
   - Cliquez sur "Install & Start Service".
   - Cliquez sur "Apply Intercept Policy".
   - Pour annuler, cliquez sur "Revoke Policy" ou "Uninstall Service".
4. Liste des modèles Ollama dans la Web UI :
   - Cliquez sur "Refresh" pour afficher les modèles locaux.
   - Cliquez sur "Copy" pour copier le nom du modèle.
5. Mappage des modèles dans la Web UI :
   - Cliquez sur "Refresh" pour voir les mappages existants.
   - Cliquez sur "Add Mapping" pour ajouter une nouvelle ligne.
     - Renseignez le nom du modèle local dans "Local Model Name" (ex. `llama2-13b`).
     - Renseignez l’alias global dans "Mapping ID" (ex. `OpenAI-llama2-13b`) pour l’utiliser dans des IDE comme TRAE.
   - Cliquez sur "Save" pour enregistrer.
   - Cliquez sur "Delete" pour supprimer.
6. Test de chat dans la Web UI :
   - Sélectionnez "Mapping ID" et "Streaming" ("Streaming" ou "Non-Streaming").
   - Choisissez "Test Mode" : "Explicit Bridge (/v1, local)" ou "Transparent Interception (https://api.openai.com)".
   - Cliquez sur "System Status" pour confirmer l’affichage "HTTPS: Enabled · hosts: Written" lors du test d’interception transparente.
   - Optionnel : saisissez "API Key". Si `EXPECTED_API_KEY` est défini et `ACCEPT_ANY_API_KEY=false`, vous devez saisir exactement cette valeur.
   - Saisissez votre message et cliquez sur "Send". Si une réponse s’affiche, le test est réussi.
   - Cliquez sur "Clear" pour effacer le chat.

<picture>
    <img src="../img/WebUI.png" alt="Aperçu de la WebUI">
</picture>

## Configurer Trae IDE
0. Terminez le démarrage rapide et vérifiez que le test de chat fonctionne.
1. Ouvrez et connectez-vous à Trae IDE.
2. Dans la boîte de dialogue IA, cliquez sur `Paramètres (engrenage) / Modèles / Ajouter un modèle`.
3. Fournisseur : sélectionnez `OpenAI`.
4. Modèle : choisissez `Modèle personnalisé`.
5. ID du modèle : utilisez l’alias défini dans `映射ID` (ex. `OpenAI-llama2-13b`).
6. Clé API : une valeur quelconque fonctionne par défaut. Si `EXPECTED_API_KEY` est défini dans `.env`, vous devez entrer exactement cette valeur.
7. Cliquez sur `Ajouter un modèle`.
8. Dans le chat, sélectionnez votre modèle personnalisé.

<picture>
    <img src="../img/TRAESetting.png" alt="Paramétrage du modèle TRAE" style="width:49%;display:inline-block;vertical-align:top;">
    <img src="../img/TRAESetting2.png" alt="Paramétrage du modèle TRAE 2" style="width:49%;display:inline-block;vertical-align:top;">
</picture>

## Modes d’utilisation
- Interception transparente : pour les clients qui appellent `https://api.openai.com`. Le mappage système 443→PORT, associé à un CA local et à un certificat de domaine, valide TLS et prend en charge le trafic.
- Pont explicite : si le client permet un Base URL personnalisé, utilisez `http://localhost:PORT/v1` ou `https://localhost:PORT/v1` (si HTTPS est activé).

## FAQ
- L’interception transparente échoue ?
  - Dans la Web UI, cliquez sur "System Status" et confirmez l’affichage "HTTPS: Enabled · hosts: Written".
  - Dans PowerShell, exécutez `netsh interface portproxy show all` et vérifiez `0.0.0.0:443 → 127.0.0.1:PORT` ou `::0:443 → ::1:PORT`. S’il n’y a rien, cliquez sur "Apply Intercept Policy" dans la Web UI.
  - Certificats & confiance : installez le CA local sous "Trusted Root Certification Authorities" et générez/faites confiance au certificat de domaine pour `api.openai.com` (`certmgr.msc`).
  - Résolution hosts : vérifiez `C:\Windows\System32\drivers\etc\hosts` pour un pointage local de `api.openai.com` (IPv4/IPv6) sans entrées conflictuelles.
  - CORS navigateur : en cas d’alertes CORS/certificats, testez avec "Explicit Bridge" dans la Web UI ou directement dans l’IDE.

- Le port du service est occupé (`EADDRINUSE`) ?
  - Modifiez `PORT` dans `.env` vers un port libre ou terminez le processus qui l’occupe.

- Comment fonctionne la validation de la clé API ?
  - Avec `ACCEPT_ANY_API_KEY=true` (par défaut), toute clé est acceptée.
  - Avec `ACCEPT_ANY_API_KEY=false` et `EXPECTED_API_KEY` défini, la requête doit inclure exactement cette clé.
  - Renseigner "API Key" dans la Web UI envoie automatiquement `Authorization: Bearer <key>`.

- Les réponses contiennent des blocs `<think>...</think>` ?
  - Réglez `STRIP_THINK_TAGS=true` pour éliminer `<think>` et obtenir une sortie plus propre dans l’IDE.

## API d’administration
- `GET/POST/DELETE /bridge/models` : gestion des mappages
- `GET /bridge/ollama/models` : lister les modèles locaux
- `POST /bridge/setup/https-hosts` : générer/réutiliser le CA local et le certificat de domaine, écrire dans hosts et configurer 443→PORT
- `POST /bridge/setup/install-elevated-service` : installer/démarrer un service auxiliaire sans interaction
- `POST /bridge/setup/uninstall-elevated-service` : désinstaller le service auxiliaire
- `GET /bridge/setup/elevated-service-status` : état du service auxiliaire
- `GET /bridge/setup/status` : vérifier l’état de HTTPS et des hosts
- `POST /bridge/setup/revoke` : révoquer l’interception (arrêter le proxy/redirection et nettoyer hosts)

## Licence
MIT (voir `LICENSE` à la racine).

## Remerciements
[Article de wkgcass](https://zhuanlan.zhihu.com/p/1901085516268546004) à l’origine de ce projet.

---

## Restez à jour
Ajoutez une Star et Watch pour recevoir les mises à jour.
> Si ce projet vous est utile, une Star est la bienvenue !  
> [GitHub : TRAE-Ollama-Bridge](https://github.com/Noyze-AI/TRAE-Ollama-Bridge)