import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ensureCertificate } from './auto-fetch-certificate.js';
import { ensureCertificateLdapJS } from './auto-fetch-certificate-ldapjs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Gestionnaire de certificats avec support Railway
 */
export class CertificateManager {
  constructor() {
    // Utiliser un répertoire persistant si disponible (Railway volume)
    // Sinon utiliser le répertoire local
    this.certDir = process.env.CERT_DIR || path.join(__dirname, 'certificates');
    
    // Créer le répertoire s'il n'existe pas
    if (!fs.existsSync(this.certDir)) {
      fs.mkdirSync(this.certDir, { recursive: true });
      console.log(`📁 Répertoire certificats créé: ${this.certDir}`);
    }
    
    // Cache mémoire pour les certificats
    this.certCache = new Map();
    
    // Méthode de récupération (ldapjs par défaut pour Railway)
    this.useLdapJS = process.env.USE_LDAPJS !== 'false';
  }
  
  /**
   * Obtenir un certificat (depuis cache, fichier ou LDAP)
   */
  async getCertificate(organismeCode) {
    // Normaliser le code
    const fullCode = organismeCode.length === 3 ? `01${organismeCode}` : organismeCode;
    
    // 1. Vérifier le cache mémoire
    if (this.certCache.has(fullCode)) {
      console.log(`💾 Certificat ${fullCode} trouvé dans le cache`);
      return this.certCache.get(fullCode);
    }
    
    // 2. Vérifier sur disque
    const certPath = path.join(this.certDir, `${fullCode}.pem`);
    if (fs.existsSync(certPath)) {
      console.log(`📄 Certificat ${fullCode} chargé depuis le disque`);
      const cert = fs.readFileSync(certPath, 'utf8');
      this.certCache.set(fullCode, cert);
      return cert;
    }
    
    // 3. Récupérer depuis LDAP
    console.log(`🌐 Récupération LDAP pour ${fullCode}...`);
    try {
      let cert;
      
      if (this.useLdapJS) {
        // Utiliser ldapjs (pure Node.js - recommandé pour Railway)
        const { ensureCertificateLdapJS } = await import('./auto-fetch-certificate-ldapjs.js');
        cert = await ensureCertificateLdapJS(organismeCode);
      } else {
        // Utiliser ldapsearch (nécessite openldap-clients)
        cert = await ensureCertificate(organismeCode);
      }
      
      // Sauvegarder dans le répertoire persistant
      const newCertPath = path.join(this.certDir, `${fullCode}.pem`);
      fs.writeFileSync(newCertPath, cert);
      console.log(`💾 Certificat ${fullCode} sauvegardé dans ${this.certDir}`);
      
      // Mettre en cache
      this.certCache.set(fullCode, cert);
      
      return cert;
    } catch (error) {
      throw new Error(`Impossible de récupérer le certificat ${fullCode}: ${error.message}`);
    }
  }
  
  /**
   * Charger tous les certificats disponibles au démarrage
   */
  loadAvailableCertificates() {
    let loadedCount = 0;
    
    try {
      // Charger depuis le répertoire principal
      const mainDirFiles = fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.pem') && /^\d+\.pem$/.test(file));
      
      // Charger depuis le répertoire des certificats
      let certDirFiles = [];
      if (fs.existsSync(this.certDir)) {
        certDirFiles = fs.readdirSync(this.certDir)
          .filter(file => file.endsWith('.pem') && /^\d+\.pem$/.test(file));
      }
      
      // Combiner les deux listes (sans doublons)
      const allFiles = [...new Set([...mainDirFiles, ...certDirFiles])];
      
      allFiles.forEach(file => {
        const code = file.replace('.pem', '');
        
        // Chercher d'abord dans le répertoire des certificats
        let certPath = path.join(this.certDir, file);
        if (!fs.existsSync(certPath)) {
          certPath = path.join(__dirname, file);
        }
        
        try {
          const cert = fs.readFileSync(certPath, 'utf8');
          this.certCache.set(code, cert);
          process.env[`CPAM_CERT_${code}`] = cert;
          console.log(`✅ Certificat ${code} chargé`);
          loadedCount++;
        } catch (error) {
          console.error(`❌ Erreur chargement ${file}:`, error.message);
        }
      });
    } catch (error) {
      console.error('❌ Erreur lecture répertoires:', error.message);
    }
    
    console.log(`📜 ${loadedCount} certificats chargés`);
    
    // Copier les certificats du répertoire principal vers le répertoire persistant
    this.syncCertificates();
    
    return loadedCount;
  }
  
  /**
   * Synchroniser les certificats du répertoire principal vers le répertoire persistant
   */
  syncCertificates() {
    if (this.certDir === __dirname) return; // Pas besoin de sync si même répertoire
    
    try {
      const mainDirFiles = fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.pem') && /^\d+\.pem$/.test(file));
      
      mainDirFiles.forEach(file => {
        const srcPath = path.join(__dirname, file);
        const destPath = path.join(this.certDir, file);
        
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`📋 Certificat ${file} copié vers ${this.certDir}`);
        }
      });
    } catch (error) {
      console.error('⚠️ Erreur sync certificats:', error.message);
    }
  }
  
  /**
   * Obtenir la liste des certificats disponibles
   */
  getAvailableCertificates() {
    return Array.from(this.certCache.keys());
  }
}

// Instance singleton
export const certificateManager = new CertificateManager();