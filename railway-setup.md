# Configuration Railway pour B2 SMIME Service

## Option 1 : Avec Volume Persistant (Recommandé)

### 1. Dans l'interface Railway :

1. Allez dans votre projet
2. Cliquez sur le service "b2-smime-service"
3. Onglet "Settings" → Section "Volumes"
4. Cliquez "Add Volume"
   - Mount Path: `/app/certificates`
   - Size: 1GB (largement suffisant)

### 2. Variables d'environnement :

Dans Railway, ajoutez ces variables :

```
API_KEY=votre-cle-api-secrete
SENDGRID_API_KEY=SG.xxxxx
CERT_DIR=/app/certificates
USE_LDAPJS=true
PORT=3001
```

## Option 2 : Sans Volume (Plus Simple)

Si vous ne voulez pas gérer de volume, les certificats seront récupérés à chaque démarrage :

### Variables d'environnement :

```
API_KEY=votre-cle-api-secrete
SENDGRID_API_KEY=SG.xxxxx
USE_LDAPJS=true
PORT=3001
```

Les certificats seront stockés dans `/app` (non persistant).

## Option 3 : Pré-charger les Certificats

Pour éviter les appels LDAP en production, vous pouvez :

1. **Récupérer tous les certificats localement** :

```bash
# Script pour récupérer tous les certificats courants
node fetch-all-certificates.js
```

2. **Les inclure dans votre repo Git** (dans le dossier du service)

3. **Déployer normalement**

## Vérification du Déploiement

Une fois déployé, testez :

```bash
# Vérifier la santé du service
curl https://votre-app.up.railway.app/health

# Lister les certificats disponibles
curl -H "X-API-Key: votre-cle-api" \
  https://votre-app.up.railway.app/certificates
```

## Notes Importantes

- **Avec volume** : Les certificats sont conservés entre les redéploiements
- **Sans volume** : Les certificats sont récupérés via LDAP à chaque démarrage
- **Performance** : Le premier appel pour un organisme sera plus lent (récupération LDAP)
- **Sécurité** : Les certificats sont publics, pas de risque de sécurité

## Problèmes Courants

### "LDAP connection timeout"
→ Railway pourrait bloquer les connexions LDAP sortantes. Utilisez `USE_LDAPJS=true`.

### "Certificate not found"
→ Vérifiez que le code organisme est correct et que le certificat existe dans l'annuaire SESAM-Vitale.

### "Volume not mounting"
→ Redéployez le service après avoir ajouté le volume.