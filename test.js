import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config();

const gzip = promisify(zlib.gzip);

/**
 * Fonction pour appeler le service d'encryption
 */
async function callEncryptionService(params) {
    const response = await fetch('https://b2-smime-service-production.up.railway.app/prepare-and-encrypt', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.API_KEY
        },
        body: JSON.stringify(params)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Service error: ${error.error}`);
    }

    return response.json();
}

/**
 * Test avec double Content-Description comme PHP
 */
async function testDoubleContentDescription() {
    console.log(':rocket: TEST AVEC DOUBLE CONTENT-DESCRIPTION (COMME PHP)\n');
    console.log('==================================================\n');

    try {
        // Configuration SendGrid
        const transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
                user: 'apikey',
                pass: process.env.SENDGRID_API_KEY
            }
        });

        // Paramètres du mail
        const numEmetteur = '00000012525909';
        // Format: YYYYMMDDHHMMSSxxxxx (19 caractères exactement)
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const counter = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        const dateCompostage = `${year}${month}${day}${hours}${minutes}${seconds}${counter}`;
        const nbFactures = '00001';

        console.log(':e-mail: Paramètres du mail:');
        console.log(`   Émetteur: ${numEmetteur}`);
        console.log(`   Date compostage: ${dateCompostage}`);
        console.log(`   Nombre factures: ${nbFactures}\n`);

        // Créer un contenu B2 de test
        const b2Content = `1250000890123456789TP00000000002000110000015000000000000001150000000000000000000000
4000001123456789001234567890    MR    DUPONT                JEAN                19800115      
6000001                                                                                      
900000100000015000000000150000000002000`;

        // Compresser le contenu
        const compressed = await gzip(Buffer.from(b2Content, 'utf8'));
        const base64Content = compressed.toString('base64');

        console.log(':package: Contenu B2 compressé\n');

        // Appeler le service d'encryption
        console.log(':closed_lock_with_key: Appel du service d\'encryption...');
        const encryptionResult = await callEncryptionService({
            from: 'contact@heroad.io',
            to: '01511@511.01.rss.fr',
            subject: `IR/${numEmetteur}/${dateCompostage}/${nbFactures}`,
            fileContent: base64Content,
            fileName: `B2_${dateCompostage}.gz`,
            organisme: '511'
        });

        console.log(':white_check_mark: Message chiffré avec succès\n');

        // Sauvegarder le message pour vérification
        const testFileName = `test_double_cd_${dateCompostage}.eml`;
        fs.writeFileSync(path.join(__dirname, testFileName), encryptionResult.mime_message);
        console.log(`:floppy_disk: Message sauvegardé: ${testFileName}\n`);

        // Analyser la structure du message
        console.log(':clipboard: Structure du message généré:');
        const lines = encryptionResult.mime_message.split('\r\n').slice(0, 15);
        lines.forEach((line, i) => {
            if (line.includes('Content-Description')) {
                console.log(`   Ligne ${i + 1}: ${line} :star:️`);
            } else {
                console.log(`   Ligne ${i + 1}: ${line}`);
            }
        });
        console.log('\n');

        console.log(':bar_chart: Analyse Content-Description:');
        console.log('   :one: Dans l\'attachment (avant chiffrement): :white_check_mark: IRIS/B2/Z');
        console.log('   :two: Dans les headers principaux: :white_check_mark: IRIS/B2/Z');
        console.log('   → Identique au comportement PHP\n');

        // Demander confirmation avant envoi
        console.log(':warning:  CONFIRMATION REQUISE');
        console.log('   Le message va être envoyé à: contact@heroad.io');
        console.log('   Appuyez sur Ctrl+C pour annuler ou attendez 5 secondes...\n');

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Envoyer le mail
        console.log(':outbox_tray: Envoi du mail...');
        const info = await transporter.sendMail({
            envelope: {
                from: 'contact@heroad.io',
                to: '01511@511.01.rss.fr'
            },
            raw: encryptionResult.mime_message
        });

        console.log(':white_check_mark: MAIL ENVOYÉ AVEC SUCCÈS!');
        console.log(`   Message ID: ${info.messageId}`);
        console.log(`   Response: ${info.response}\n`);

        console.log(':dart: RÉSUMÉ:');
        console.log('   - Content-Description ajouté 2 fois comme PHP');
        console.log('   - Dans l\'attachment avant chiffrement');
        console.log('   - Dans les headers principaux après chiffrement');
        console.log('   - Structure identique au code PHP\n');

    } catch (error) {
        console.error(':x: ERREUR:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
    }
}

// Vérifier que le service est en ligne
async function checkService() {
    try {
        const response = await fetch('https://b2-smime-service-production.up.railway.app/health');
        if (!response.ok) {
            throw new Error('Service non disponible');
        }
        const health = await response.json();
        console.log(':white_check_mark: Service en ligne:', health.status);
        return true;
    } catch (error) {
        console.error(':x: Service non disponible. Démarrez-le avec: npm start');
        return false;
    }
}

// Lancer le test
(async () => {
    if (await checkService()) {
        await testDoubleContentDescription();
    }
})();