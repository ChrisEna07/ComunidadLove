/* ==========================================================================
   FILTRO DE PALABRAS OBSENAS E INAPROPIADAS
   (Costeño / Colombiano, Español e Inglés)
   ========================================================================== */

const PALABRAS_OBSCENAS = [
  // Costeño / Colombiano (Cartagena, Barranquilla, Santa Marta, etc.)
  'mamon', 'mamón', 'mamonazo', 'hijo de puta', 'hijoeputa', 'hijueputa', 'hpta', 'gonorrea',
  'malparido', 'malparida', 'carechimba', 'chimba', 'monda', 'mondá', 'marica', 'maricon',
  'maricón', 'pirobo', 'culero', 'careverga', 'verga', 'mierda', 'mierdero', 'puta', 'puto',
  'cacorro', 'tripleputa', 'cabron', 'cabrón', 'hijuemadre', 'jijuemadre', 'caremonda', 'caremondá',
  'culipronta', 'culipronto', 'sipote', 'petardo', 'corroncho', 'cascorro', 'careculo',
  // Español general y otros departamentos
  'pendejo', 'pendeja', 'pendejada', 'joder', 'pingo', 'boludo', 'pelotudo', 'gil', 'concha',
  'conchudo', 'culiao', 'hijo de perra', 'maraco', 'chucha', 'mamaguevo', 'mamagüevo', 'guevon',
  'güevón', 'guevón', 'weon', 'culito', 'teta', 'panocha', 'bollo', 'guaricha',
  // Inglés
  'fuck', 'fucking', 'shit', 'asshole', 'bitch', 'cunt', 'dick', 'bastard', 'motherfucker',
  'whore', 'piss', 'crap', 'wanker', 'bollocks'
];

/**
 * Retorna true si el texto contiene palabras obscenas o lenguaje inapropiado.
 */
export function contienePalabrasObscenas(texto) {
  if (!texto) return false;

  const textoNormalizado = String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (let i = 0; i < PALABRAS_OBSCENAS.length; i++) {
    const palabra = PALABRAS_OBSCENAS[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (palabra.includes(' ')) {
      if (textoNormalizado.includes(palabra)) return true;
    } else {
      const regex = new RegExp(`\\b${palabra}\\b`, 'i');
      if (regex.test(textoNormalizado)) return true;
    }
  }

  return false;
}
