# Configuration du Volume Persistant Railway

## Vue d'ensemble

Ce service utilise un volume persistant Railway pour stocker les certificats CPAM de manière permanente. Cela permet de :
- Conserver les certificats entre les redéploiements
- Réduire les appels LDAP répétitifs
- Améliorer les performances du service

## Configuration du Volume dans Railway

### 1. Créer le Volume

Dans l'interface Railway :
1. Aller dans les paramètres du service
2. Section "Volumes"
3. Cliquer sur "Add Volume"
4. Configuration :
   - **Mount Path**: `/app/certificates`
   - **Name**: `certificates` (ou nom de votre choix)
   - **Size**: 1GB (largement suffisant pour les certificats)

### 2. Variables d'Environnement Requises

Ces variables sont déjà configurées dans `railway.toml` mais peuvent être ajustées dans l'interface Railway :

```env
# Répertoire du volume persistant
CERT_DIR=/app/certificates

# Utiliser ldapjs (pure Node.js, recommandé pour Railway)
USE_LDAPJS=true

# SendGrid pour l'envoi d'emails
SENDGRID_API_KEY=your_sendgrid_api_key

# Clé API pour l'authentification
API_KEY=your_api_key

# Mode debug (optionnel)
DEBUG=false
```

## Architecture du Système

### Flux de Démarrage

1. **Initialisation** (`init-certificates.js`)
   - Vérifie l'existence du répertoire `/app/certificates`
   - Copie les certificats existants du projet vers le volume
   - Affiche l'état du volume (certificats présents, dates de modification)
   - Crée un fichier témoin `.initialized` pour tracer les redémarrages

2. **Démarrage du Service** (`index.js`)
   - Le `CertificateManager` charge tous les certificats depuis le volume
   - Met en cache en mémoire pour les performances
   - Synchronise automatiquement les nouveaux certificats

### Gestion des Certificats

Le système utilise une hiérarchie à 3 niveaux :

1. **Cache Mémoire** (plus rapide)
   - Certificats chargés en RAM
   - Vidé à chaque redémarrage

2. **Volume Persistant** (`/app/certificates`)
   - Stockage permanent entre redéploiements
   - Survit aux mises à jour du code

3. **Récupération LDAP** (fallback)
   - Si certificat non trouvé localement
   - Automatiquement sauvegardé dans le volume

### Structure des Fichiers

```
/app/certificates/
├── .initialized          # Fichier témoin avec timestamp
├── 01751.pem            # Certificat CPAM Paris
├── 01059.pem            # Certificat CPAM Nord
├── 01013.pem            # Certificat CPAM Bouches-du-Rhône
└── ...                  # Autres certificats
```

## Logs et Monitoring

### Logs au Démarrage

Le service produit des logs détaillés au démarrage :

```
🚀 Initialisation du volume de certificats...
📁 Répertoire cible: /app/certificates
✅ Permissions lecture/écriture confirmées
📄 3 certificat(s) trouvé(s) dans le projet
  ✅ 01751.pem copié vers le volume
  ℹ️ 01059.pem existe déjà dans le volume
📊 État du volume de certificats:
  Total: 5 certificat(s)
⏰ Dernière initialisation: 2024-01-15T10:30:00.000Z
✨ Initialisation terminée
```

### Logs des Requêtes

Pour chaque requête `/prepare-and-encrypt` :

```
========================================
📨 Nouvelle requête /prepare-and-encrypt
⏰ 2024-01-15T14:30:00.000Z
📋 Paramètres reçus:
   - From: expediteur@example.com
   - To: destinataire@cpam.fr
   - Organisme: 751
🔍 Recherche du certificat pour l'organisme 751...
📜 Certificat trouvé avec le préfixe 01: CPAM_CERT_01751
🔐 Début du chiffrement S/MIME...
✅ Chiffrement réussi (taille: 4567 chars)
📧 Tentative d'envoi de mail...
✅ Mail envoyé avec succès!
========================================
```

## Maintenance

### Vérifier l'État du Volume

SSH dans le conteneur Railway :
```bash
# Lister les certificats
ls -la /app/certificates/

# Vérifier le fichier témoin
cat /app/certificates/.initialized

# Compter les certificats
ls /app/certificates/*.pem | wc -l
```

### Nettoyer le Volume

Si nécessaire, pour réinitialiser :
```bash
# Supprimer tous les certificats (attention !)
rm /app/certificates/*.pem

# Garder seulement le fichier témoin
rm /app/certificates/[0-9]*.pem
```

### Récupérer Manuellement un Certificat

```bash
# Utiliser le script de récupération
node fetch-all-certificates.js

# Ou pour un organisme spécifique
curl -X POST https://your-service.up.railway.app/prepare-and-encrypt \
  -H "x-api-key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"organisme": "751", ...}'
```

## Troubleshooting

### Le Volume ne Persiste pas

1. Vérifier dans Railway que le volume est bien attaché
2. Vérifier le mount path : `/app/certificates`
3. Regarder les logs d'initialisation

### Erreur de Permissions

```
❌ Erreur permissions sur le répertoire
```

Solution : Vérifier que le Dockerfile crée bien le répertoire avec les bonnes permissions.

### Certificat non Trouvé

Le système essaiera automatiquement de :
1. Chercher avec le code fourni (ex: `751`)
2. Chercher avec le préfixe `01` (ex: `01751`)
3. Récupérer via LDAP si non trouvé
4. Sauvegarder dans le volume pour la prochaine fois

### Volume Plein

Peu probable avec 1GB, mais si nécessaire :
- Les certificats font ~2-3 KB chacun
- 1GB peut contenir ~300,000 certificats
- Augmenter la taille dans Railway si besoin

## Performance

Avec le volume persistant :
- **Premier appel** : ~500ms (récupération LDAP si nécessaire)
- **Appels suivants** : <10ms (depuis le cache mémoire)
- **Après redémarrage** : <50ms (chargement depuis le volume)

Sans volume persistant :
- Chaque redémarrage nécessite de re-télécharger tous les certificats
- Impact réseau et performance significatif

## Sécurité

- Les certificats sont des certificats publics (pas de clés privées)
- Le volume est isolé par service dans Railway
- Accès protégé par API Key
- Pas de données sensibles stockées

## Migration depuis l'Ancienne Version

Si vous migrez depuis une version sans volume :

1. Les certificats existants dans le code seront automatiquement copiés
2. Le script `init-certificates.js` gère la migration
3. Aucune action manuelle requise

## Contact et Support

Pour toute question sur la configuration du volume Railway, consulter :
- [Documentation Railway Volumes](https://docs.railway.app/guides/volumes)
- Logs du service dans Railway Dashboard
- Script de test : `test.js`