/**
 * Génère une date de compostage au format CPAM
 * Format: YYYYMMDDHHMMSSxxxxx (19 caractères)
 * @returns {string} Date de compostage formatée
 */
export function generateCompostageDate() {
  const now = new Date();
  
  // Extraire les composants de la date
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  
  // Générer un compteur unique de 5 chiffres
  // Utilise les millisecondes + un nombre aléatoire pour éviter les doublons
  const millis = now.getMilliseconds();
  const random = Math.floor(Math.random() * 100);
  const counter = ((millis * 100) + random).toString().padStart(5, '0').slice(-5);
  
  const dateCompostage = `${year}${month}${day}${hours}${minutes}${seconds}${counter}`;
  
  // Vérifier la longueur
  if (dateCompostage.length !== 19) {
    throw new Error(`Date de compostage invalide: ${dateCompostage} (${dateCompostage.length} caractères au lieu de 19)`);
  }
  
  return dateCompostage;
}

// Test
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Test de génération de date de compostage:');
  for (let i = 0; i < 5; i++) {
    const date = generateCompostageDate();
    console.log(`  ${date} (${date.length} caractères)`);
    // Petite pause pour avoir des valeurs différentes
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}