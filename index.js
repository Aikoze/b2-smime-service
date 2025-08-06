import express from 'express';
import cors from 'cors';
import forge from 'node-forge';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import { certificateManager } from './certificate-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config();

// Charger les certificats disponibles au démarrage
const loadedCerts = certificateManager.loadAvailableCertificates();
console.log(`\n🚀 Service prêt avec ${loadedCerts} certificats pré-chargés`);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

// Middleware d'authentification
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

/**
 * Chiffre un message MIME avec S/MIME
 * @param {string} mimeMessage - Le message MIME à chiffrer
 * @param {string} recipientCertPEM - Le certificat du destinataire en format PEM
 * @returns {string} Le message S/MIME chiffré
 */
function encryptSMIME(mimeMessage, recipientCertPEM) {
  try {
    // Parser le certificat PEM
    const cert = forge.pki.certificateFromPem(recipientCertPEM);
    
    // Créer l'enveloppe PKCS#7
    const p7 = forge.pkcs7.createEnvelopedData();
    
    // Ajouter le certificat du destinataire
    p7.addRecipient(cert);
    
    // Définir le contenu à chiffrer
    p7.content = forge.util.createBuffer(mimeMessage, 'utf8');
    
    // IMPORTANT: Spécifier AES-128-CBC comme requis par la documentation CPAM
    p7.encryptedContent = {
      algorithm: forge.pki.oids['aes128-CBC'],
      parameter: forge.util.createBuffer(forge.random.getBytesSync(16)) // IV de 16 octets pour AES
    };
    
    // Chiffrer avec l'algorithme spécifié
    p7.encrypt();
    
    // Convertir en PEM (format S/MIME)
    const smimePem = forge.pkcs7.messageToPem(p7);
    
    // Extraire le contenu base64 du PEM (sans les headers)
    const base64Content = smimePem
      .replace(/-----BEGIN PKCS7-----[\r\n]*/g, '')
      .replace(/[\r\n]*-----END PKCS7-----/g, '')
      .replace(/[\r\n]/g, '');
    
    // Formater en lignes de 64 caractères comme le mail fonctionnel
    const formattedBase64 = base64Content.match(/.{1,64}/g) || [base64Content];
    return formattedBase64.join('\r\n');
  } catch (error) {
    console.error('Erreur chiffrement S/MIME:', error);
    console.error('Stack:', error.stack);
    throw new Error(`Erreur chiffrement S/MIME: ${error.message}`);
  }
}

/**
 * Endpoint de santé
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'b2-smime-service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * Endpoint pour chiffrer un message avec S/MIME
 */
app.post('/encrypt', authenticate, async (req, res) => {
  try {
    const { message, organisme } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message requis' });
    }
    
    if (!organisme) {
      return res.status(400).json({ error: 'Code organisme requis' });
    }
    
    // Récupérer le certificat CPAM
    // D'abord essayer avec le code fourni, puis avec 01 + code si c'est un code court
    let certKey = `CPAM_CERT_${organisme}`;
    let cpamCert = process.env[certKey];
    
    // Si pas trouvé et code court (3 chiffres), essayer avec le préfixe 01
    if (!cpamCert && organisme.length === 3) {
      certKey = `CPAM_CERT_01${organisme}`;
      cpamCert = process.env[certKey];
    }
    
    if (!cpamCert) {
      // Essayer de récupérer le certificat via le gestionnaire
      try {
        cpamCert = await certificateManager.getCertificate(organisme);
        
        // Le gestionnaire s'occupe du cache et du stockage
        const fullCode = organisme.length === 3 ? `01${organisme}` : organisme;
        process.env[`CPAM_CERT_${fullCode}`] = cpamCert;
        
      } catch (fetchError) {
        return res.status(404).json({ 
          error: `Certificat non trouvé pour l'organisme ${organisme}`,
          fetch_error: fetchError.message,
          available_organisms: Object.keys(process.env)
            .filter(key => key.startsWith('CPAM_CERT_'))
            .map(key => key.replace('CPAM_CERT_', ''))
        });
      }
    }
    
    // Chiffrer le message
    const encryptedContent = encryptSMIME(message, cpamCert);
    
    // Construire le message S/MIME complet avec les headers
    let smimeMessage = '';
    smimeMessage += 'Content-Type: application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"\r\n';
    smimeMessage += 'Content-Transfer-Encoding: base64\r\n';
    smimeMessage += 'Content-Disposition: attachment; filename="smime.p7m"\r\n';
    smimeMessage += 'Content-Description: S/MIME Encrypted Message\r\n';
    smimeMessage += '\r\n';
    smimeMessage += encryptedContent;
    
    res.json({
      success: true,
      organisme: organisme,
      encrypted: true,
      message: smimeMessage,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Endpoint pour préparer et chiffrer un message MIME complet
 */
app.post('/prepare-and-encrypt', authenticate, async (req, res) => {
  try {
    const { 
      from, 
      to, 
      subject, 
      fileContent, 
      fileName, 
      organisme,
      boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@heroad.io>`
    } = req.body;
    
    // Valider les paramètres requis
    if (!from || !to || !subject || !fileContent || !fileName || !organisme) {
      return res.status(400).json({ 
        error: 'Paramètres manquants',
        required: ['from', 'to', 'subject', 'fileContent', 'fileName', 'organisme']
      });
    }
    
    // Construire le message MIME à chiffrer (juste la partie attachment)
    let attachmentPart = '';
    attachmentPart += 'Content-Type: Application/EDI-consent\r\n';
    attachmentPart += 'Content-Transfer-Encoding: base64\r\n';
    attachmentPart += 'Content-Description: IRIS/B2/Z\r\n'; // Ajouté dans l'attachment comme PHP
    attachmentPart += `Content-Disposition: attachment; filename="${fileName}"\r\n`;
    attachmentPart += '\r\n';
    
    // Formater le contenu base64
    const base64Lines = fileContent.match(/.{1,76}/g) || [fileContent];
    attachmentPart += base64Lines.join('\r\n');
    
    // Récupérer le certificat CPAM
    // D'abord essayer avec le code fourni, puis avec 01 + code si c'est un code court
    let certKey = `CPAM_CERT_${organisme}`;
    let cpamCert = process.env[certKey];
    
    // Si pas trouvé et code court (3 chiffres), essayer avec le préfixe 01
    if (!cpamCert && organisme.length === 3) {
      certKey = `CPAM_CERT_01${organisme}`;
      cpamCert = process.env[certKey];
    }
    
    if (!cpamCert) {
      // Essayer de récupérer le certificat via le gestionnaire
      try {
        cpamCert = await certificateManager.getCertificate(organisme);
        
        // Le gestionnaire s'occupe du cache et du stockage
        const fullCode = organisme.length === 3 ? `01${organisme}` : organisme;
        process.env[`CPAM_CERT_${fullCode}`] = cpamCert;
        
      } catch (fetchError) {
        return res.status(404).json({ 
          error: `Certificat non trouvé pour l'organisme ${organisme}`,
          fetch_error: fetchError.message
        });
      }
    }
    
    // Chiffrer uniquement la partie attachment
    const encryptedContent = encryptSMIME(attachmentPart, cpamCert);
    
    // Construire le message MIME complet EXACTEMENT comme le PHP
    let fullMessage = '';
    
    // Headers principaux EXACTEMENT comme le mail fonctionnel
    fullMessage += `From: ${from}\r\n`;
    fullMessage += `Subject: ${subject}\r\n`;
    fullMessage += 'Content-Description: IRIS/B2/Z\r\n'; // Requis par le format
    fullMessage += 'Content-Type: Application/EDI-consent\r\n';
    fullMessage += 'Content-Transfer-Encoding: base64\r\n';
    fullMessage += 'X-SV_CHIFFREMENT: HERO#Heroad#1.40#A#2\r\n';
    fullMessage += `Message-ID: ${messageId}\r\n`;
    fullMessage += 'MIME-Version: 1.0\r\n';
    fullMessage += `Date: ${new Date().toUTCString()}\r\n`;
    fullMessage += `To: ${to}\r\n`;
    
    // Headers S/MIME qui remplacent certains headers
    fullMessage += 'Content-Transfer-Encoding: base64\r\n';
    fullMessage += 'Content-Disposition: attachment; name=smime.p7m\r\n';
    fullMessage += 'Content-Type: application/pkcs7-mime; smime-type=enveloped-data;\r\n';
    fullMessage += ' name=smime.p7m\r\n'; // Sur 2 lignes EXACTEMENT comme dans le mail fonctionnel
    fullMessage += '\r\n'; // Ligne vide OBLIGATOIRE
    fullMessage += encryptedContent;
    
    res.json({
      success: true,
      organisme: organisme,
      encrypted: true,
      message_id: messageId,
      mime_message: fullMessage,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Endpoint pour vérifier les certificats disponibles
 */
app.get('/certificates', authenticate, (req, res) => {
  const certificates = Object.keys(process.env)
    .filter(key => key.startsWith('CPAM_CERT_'))
    .map(key => {
      const organisme = key.replace('CPAM_CERT_', '');
      const cert = process.env[key];
      
      try {
        // Parser le certificat pour extraire les informations
        const parsedCert = forge.pki.certificateFromPem(cert);
        const subject = parsedCert.subject.attributes.reduce((acc, attr) => {
          acc[attr.shortName] = attr.value;
          return acc;
        }, {});
        
        return {
          organisme,
          subject: subject.CN || 'Unknown',
          issuer: parsedCert.issuer.getField('CN')?.value || 'Unknown',
          validFrom: parsedCert.validity.notBefore.toISOString(),
          validTo: parsedCert.validity.notAfter.toISOString(),
          isValid: new Date() >= parsedCert.validity.notBefore && 
                   new Date() <= parsedCert.validity.notAfter
        };
      } catch (error) {
        return {
          organisme,
          error: 'Certificat invalide',
          message: error.message
        };
      }
    });
  
  res.json({
    total: certificates.length,
    certificates,
    timestamp: new Date().toISOString()
  });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Service S/MIME B2 démarré sur le port ${PORT}`);
  console.log(`📜 Certificats chargés: ${
    Object.keys(process.env)
      .filter(key => key.startsWith('CPAM_CERT_'))
      .length
  }`);
  
  if (process.env.DEBUG === 'true') {
    console.log('🐛 Mode debug activé');
  }
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});