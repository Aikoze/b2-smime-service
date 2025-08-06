import ldap from 'ldapjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import forge from 'node-forge';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Récupère un certificat CPAM via LDAP en utilisant ldapjs (pure Node.js)
 * @param {string} organismeCode - Code organisme complet (ex: "511" ou "01511" ou "91123")
 */
export async function ensureCertificateLdapJS(organismeCode) {
  // Si le code n'a pas de préfixe de régime (3 chiffres), ajouter 01 par défaut
  let fullCode = organismeCode;
  let regime = '01';
  let codeSeul = organismeCode;
  
  if (organismeCode.length > 3) {
    regime = organismeCode.substring(0, 2);
    codeSeul = organismeCode.substring(2);
    fullCode = organismeCode;
  } else {
    fullCode = `01${organismeCode}`;
  }
  
  const certFileName = `${fullCode}.pem`;
  const certPath = path.join(__dirname, certFileName);
  
  // Vérifier si le certificat existe déjà
  if (fs.existsSync(certPath)) {
    console.log(`✅ Certificat ${certFileName} déjà présent`);
    return fs.readFileSync(certPath, 'utf8');
  }
  
  console.log(`📥 Certificat ${certFileName} manquant, récupération depuis LDAP...`);
  
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: 'ldap://annuaire.sesam-vitale.fr:389',
      timeout: 30000,
      connectTimeout: 30000
    });
    
    const email = `${fullCode}@${codeSeul}.${regime}.rss.fr`;
    const baseDn = 'ou=AC-SESAM-VITALE-2034,o=sesam-vitale,c=fr';
    const filter = `(cn=${email})`;
    
    console.log(`📡 Recherche LDAP pour: ${email}`);
    
    let certificateFound = false;
    
    client.search(baseDn, {
      filter: filter,
      scope: 'sub',
      attributes: ['userCertificate;binary']
    }, (err, res) => {
      if (err) {
        client.unbind();
        return reject(new Error(`Erreur LDAP: ${err.message}`));
      }
      
      res.on('searchEntry', (entry) => {
        const cert = entry.attributes.find(attr => attr.type === 'userCertificate;binary');
        
        if (cert && cert.buffers && cert.buffers.length > 0) {
          try {
            // Le certificat est en format DER (binaire)
            const certDer = cert.buffers[0];
            
            // Convertir DER en PEM
            const certPem = [
              '-----BEGIN CERTIFICATE-----',
              certDer.toString('base64').match(/.{1,64}/g).join('\n'),
              '-----END CERTIFICATE-----'
            ].join('\n');
            
            // Sauvegarder le certificat
            fs.writeFileSync(certPath, certPem);
            console.log(`✅ Certificat ${certFileName} récupéré et sauvegardé`);
            
            // Analyser le certificat
            try {
              const parsedCert = forge.pki.certificateFromPem(certPem);
              const subject = parsedCert.subject.getField('CN');
              const issuer = parsedCert.issuer.getField('CN');
              console.log(`📋 Sujet: ${subject ? subject.value : 'N/A'}`);
              console.log(`📋 Émetteur: ${issuer ? issuer.value : 'N/A'}`);
              console.log(`📋 Valide jusqu'au: ${parsedCert.validity.notAfter.toISOString()}`);
            } catch (e) {
              // Ignorer les erreurs d'analyse
            }
            
            certificateFound = true;
            client.unbind();
            resolve(certPem);
          } catch (error) {
            client.unbind();
            reject(new Error(`Erreur conversion certificat: ${error.message}`));
          }
        }
      });
      
      res.on('error', (err) => {
        client.unbind();
        reject(new Error(`Erreur recherche: ${err.message}`));
      });
      
      res.on('end', () => {
        if (!certificateFound) {
          client.unbind();
          reject(new Error(`Aucun certificat trouvé pour ${email}`));
        }
      });
    });
    
    client.on('error', (err) => {
      reject(new Error(`Erreur connexion LDAP: ${err.message}`));
    });
  });
}

// Si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  const organismeCode = process.argv[2];
  
  if (!organismeCode) {
    console.error('Usage: node auto-fetch-certificate-ldapjs.js <code_organisme>');
    console.error('Exemple: node auto-fetch-certificate-ldapjs.js 751');
    process.exit(1);
  }
  
  ensureCertificateLdapJS(organismeCode)
    .then(() => {
      console.log('\n✅ Terminé');
    })
    .catch(error => {
      console.error('\n❌ Échec :', error.message);
      process.exit(1);
    });
}